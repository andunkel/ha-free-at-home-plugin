import Entity from "../entity.js";
import type { ConnectionContext } from "../utils.js";
import type { HassEntity } from 'home-assistant-js-websocket';
import type { FreeAtHomeOnOffChannel } from '@busch-jaeger/free-at-home';

export default class ButtonEntity extends Entity {
    declare fhEntity: FreeAtHomeOnOffChannel;
    private lastPressTime = 0;

    async createFreeAtHomeEntities(ctx: ConnectionContext): Promise<void> {
        this.fhEntity = await ctx.freeAtHome.createSwitchingActuatorDevice(this.nativeId, this.name);

        this.fhEntity.on('isOnChanged', (value: boolean) => {
            const now = Date.now();
            // Ignore rapid duplicate events within 300ms (e.g. press+release from physical switches)
            if (now - this.lastPressTime < 300) {
                return;
            }
            this.lastPressTime = now;

            console.log(`Button ${this.id} pressed (value: ${value})`);

            const serviceDomain = this.id.split(".")[0];
            let serviceData: any = {
                type: "call_service",
                domain: serviceDomain,
                service: "press",
                target: {
                    entity_id: this.id
                }
            };

            ctx.hassConnection.sendMessagePromise(serviceData).catch((err: any) => {
                console.error("Error sending button press for", this.id, ":", err);
            });

            // Reset button state in Free@Home back to false so it acts like a push-button (Taster)
            setTimeout(() => {
                this.fhEntity.setOn(false);
            }, 300);
        });
    }

    stateChanged(hassEntity: HassEntity): boolean {
        return this.state !== hassEntity.state;
    }

    updateFreeAtHomeEntities(hassEntity: HassEntity): void {
        this.state = hassEntity.state;
        // Pulse state ON -> OFF in Free@Home when button is pressed in Home Assistant to provide visual feedback
        this.fhEntity.setOn(true);
        setTimeout(() => {
            this.fhEntity.setOn(false);
        }, 300);
    }
}
