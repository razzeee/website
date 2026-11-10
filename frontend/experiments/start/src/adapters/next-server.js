export class NextRequest extends Request {
  get nextUrl() {
    return new URL(this.url)
  }
}
export const NextResponse = Response
