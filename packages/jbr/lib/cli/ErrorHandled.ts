/**
 * An error that should be considered a non-programming error,
 * which can be handled by simply printing the message on the CLI.
 */
export class ErrorHandled extends Error {
  public readonly handled = true;

  public constructor(message: string) {
    super(message);
  }
}
