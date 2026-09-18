import { CheckoutPanel } from "@/components/checkout/CheckoutPanel";
import { CartReview } from "@/components/checkout/CartReview";

export const metadata = { title: "Checkout" };

// Checkout = review column + one server-quoted panel. No line-item editing
// here: quantities are adjusted in the cart; the quote (and therefore the
// charge) is always the server's, never the browser's (§2.5).
export default function CheckoutPage() {
  return (
    <div className="checkout-grid" style={{ maxWidth: 1080, margin: "0 auto" }}>
      <CartReview />
      <CheckoutPanel />
    </div>
  );
}
