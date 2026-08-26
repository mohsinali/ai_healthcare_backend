export enum InboundNumberResolutionFailure {
  INVALID_PHONE_NUMBER = 'INVALID_PHONE_NUMBER',
  NUMBER_NOT_FOUND = 'NUMBER_NOT_FOUND',
  NUMBER_INACTIVE = 'NUMBER_INACTIVE',
  TENANT_INACTIVE = 'TENANT_INACTIVE',
  LOCATION_INACTIVE = 'LOCATION_INACTIVE',
}

export class InboundNumberResolutionError extends Error {
  constructor(readonly reason: InboundNumberResolutionFailure) {
    super('Inbound number is unavailable.');
    this.name = InboundNumberResolutionError.name;
  }
}
