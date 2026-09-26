export class SheolError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SheolError";
  }
}

export class InvariantViolation extends SheolError {
  public constructor(message: string) {
    super(message);
    this.name = "InvariantViolation";
  }
}

export class InvalidTransition extends SheolError {
  public constructor(message: string) {
    super(message);
    this.name = "InvalidTransition";
  }
}

export class ScopeViolation extends SheolError {
  public constructor(message: string) {
    super(message);
    this.name = "ScopeViolation";
  }
}
