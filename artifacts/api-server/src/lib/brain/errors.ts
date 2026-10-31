export class BrainError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "BrainError";
  }
}
