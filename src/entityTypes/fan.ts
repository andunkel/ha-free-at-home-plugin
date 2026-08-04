import Entity from "../entity.js";
import type { ConnectionContext } from "../utils.js";
import type { HassEntity } from 'home-assistant-js-websocket';

export default class FanEntity extends Entity {
    declare fhEntity: any;
    percentage?: number;

    constructor(entity: HassEntity, ctx: ConnectionContext) {
        super(entity, ctx);
        this.percentage = entity.attributes?.percentage as number | undefined;
    }

    async createFreeAtHomeEntities(ctx: ConnectionContext): Promise<void> {
        const fahAny = ctx.freeAtHome as any;
        if (typeof fahAny.createCeilingFan === 'function') {
            this.fhEntity = await fahAny.createCeilingFan(this.nativeId, this.name);
        } else if (this.percentage !== undefined && typeof fahAny.createDimActuatorDevice === 'function') {
            this.fhEntity = await fahAny.createDimActuatorDevice(this.nativeId, this.name);
        } else {
            this.fhEntity = await ctx.freeAtHome.createSwitchingActuatorDevice(this.nativeId, this.name);
        }

        this.fhEntity.on('isOnChanged', (value: boolean) => {
            console.log(`Fan ${this.id} changed to ${value}`);

            this.state = value ? "on" : "off";

            const serviceDomain = this.id.split(".")[0];
            const service = value ? "turn_on" : "turn_off";
            let serviceData: any = {
                type: "call_service",
                domain: serviceDomain,
                service: service,
                target: {
                    entity_id: this.id
                }
            };

            ctx.hassConnection.sendMessagePromise(serviceData).catch((err) => {
                console.error("Error sending fan state update for", this.id, ":", err);
            });
        });

        if (typeof this.fhEntity.on === 'function') {
            const handleSpeedChanged = (value: number) => {
                console.log(`Fan ${this.id} speed percentage changed to ${value}`);

                const serviceDomain = this.id.split(".")[0];
                let serviceData: any = {
                    type: "call_service",
                    domain: serviceDomain,
                    service: "set_percentage",
                    target: {
                        entity_id: this.id
                    },
                    service_data: {
                        percentage: value,
                    }
                };

                ctx.hassConnection.sendMessagePromise(serviceData).catch((err) => {
                    console.error("Error sending fan percentage update for", this.id, ":", err);
                });
            };

            this.fhEntity.on('absoluteFanSpeedChanged', handleSpeedChanged);
            this.fhEntity.on('absoluteValueChanged', handleSpeedChanged);
        }
    }

    stateChanged(hassEntity: HassEntity): boolean {
        return this.state !== hassEntity.state || this.percentage !== (hassEntity.attributes?.percentage as number | undefined);
    }

    updateFreeAtHomeEntities(hassEntity: HassEntity): void {
        this.state = hassEntity.state;
        this.percentage = hassEntity.attributes?.percentage as number | undefined;

        if (typeof this.fhEntity.setOnOff === 'function') {
            this.fhEntity.setOnOff(this.state === 'on');
        } else if (typeof this.fhEntity.setOn === 'function') {
            this.fhEntity.setOn(this.state === 'on');
        }

        if (this.percentage !== undefined) {
            if (typeof this.fhEntity.setAbsoluteFanSpeed === 'function') {
                this.fhEntity.setAbsoluteFanSpeed(String(this.percentage));
            } else if (typeof this.fhEntity.setValue === 'function') {
                this.fhEntity.setValue(this.percentage);
            }
        }
    }
}
