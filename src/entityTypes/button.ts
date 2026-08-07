import Entity from "../entity.js";
import type { ConnectionContext } from "../utils.js";
import type { HassEntity } from 'home-assistant-js-websocket';
import type { FreeAtHomeOnOffChannel } from '@busch-jaeger/free-at-home';

export default class ButtonEntity extends Entity {
    declare fhEntity: FreeAtHomeOnOffChannel;
    private lastPressTime = 0;

    async createFreeAtHomeEntities(ctx: ConnectionContext): Promise<void> {
        this.fhEntity = await ctx.freeAtHome.createSwitchingActuatorDevice(this.nativeId, this.name);

        const triggerPress = (source: string, detail: string) => {
            const now = Date.now();
            // Debounce rapid duplicate events within 300ms
            if (now - this.lastPressTime < 300) {
                return;
            }
            this.lastPressTime = now;

            console.log(`Button ${this.id} pressed via ${source} (${detail})`);

            if (!ctx.hassConnection) {
                console.error(`Cannot send button press for ${this.id}: Home Assistant connection not ready.`);
                return;
            }

            const serviceDomain = this.id.split(".")[0];
            let service = "press";
            if (serviceDomain === "scene" || serviceDomain === "script") {
                service = "turn_on";
            } else if (serviceDomain === "automation") {
                service = "trigger";
            }

            let serviceData: any = {
                type: "call_service",
                domain: serviceDomain,
                service: service,
                target: {
                    entity_id: this.id
                }
            };

            ctx.hassConnection.sendMessagePromise(serviceData).catch((err: any) => {
                console.error("Error sending button press for", this.id, ":", err);
            });

            // Reset button state in Free@Home back to false so it acts like a push-button (Taster)
            setTimeout(() => {
                this.fhEntity?.setOn(false);
            }, 300);
        };

        this.fhEntity.on('isOnChanged', (value: boolean) => {
            triggerPress('isOnChanged', `value: ${value}`);
        });

        const rawChannel = (this.fhEntity as any)?.channel;
        if (rawChannel) {
            rawChannel.on('inputDatapointChanged', (pairingId: number, value: string) => {
                triggerPress('inputDatapointChanged', `pairingId: ${pairingId}, value: ${value}`);
            });
            rawChannel.on('sceneTriggered', (scene: any) => {
                triggerPress('sceneTriggered', `scene: ${JSON.stringify(scene)}`);
            });
        }
    }

    stateChanged(hassEntity: HassEntity): boolean {
        return this.state !== hassEntity.state;
    }

    updateFreeAtHomeEntities(hassEntity: HassEntity): void {
        this.state = hassEntity.state;
        const now = Date.now();
        // If state changed due to our own press in Free@Home within the last 1000ms, don't double-pulse
        if (now - this.lastPressTime < 1000) {
            return;
        }

        // Pulse state ON -> OFF in Free@Home when button is pressed in Home Assistant to provide visual feedback
        this.fhEntity?.setOn(true);
        setTimeout(() => {
            this.fhEntity?.setOn(false);
        }, 300);
    }
}
