declare module "react-day-picker";

declare module "stripe" {
  namespace Stripe {
    namespace Checkout {
      type SessionCreateParams = any;
    }
  }
  class Stripe {
    constructor(apiKey: string, config?: any);
    static createFetchHttpClient(handler: (input: any, init: any) => Promise<Response>): any;
    [key: string]: any;
  }
  export default Stripe;
  export { Stripe };
}
