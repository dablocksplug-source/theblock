// src/context/CartContext.jsx
import { createContext, useContext, useState } from "react";

// Create the context
const CartContext = createContext();

// Hook to use Cart anywhere
export function useCart() {
  return useContext(CartContext);
}

// Cart Provider wrapper
export function CartProvider({ children }) {
  const [cartItems, setCartItems] = useState([]);
  const [cartTotalUSD, setCartTotalUSD] = useState(0);

  // Add item to cart
  function addToCart(product) {
    setCartItems((prev) => [...prev, product]);
    updateTotal();
  }

  // Remove item from cart
  function removeFromCart(id) {
    setCartItems((prev) => prev.filter((item) => item.id !== id));
    updateTotal();
  }

  // Clear cart completely
  function clearCart() {
    setCartItems([]);
    setCartTotalUSD(0);
  }

  // Update USD total
  function updateTotal() {
    const total = cartItems.reduce((sum, item) => sum + item.priceUSD, 0);
    setCartTotalUSD(total);
  }

  // Context value exposed to app
  const value = {
    cartItems,
    cartTotalUSD,
    addToCart,
    removeFromCart,
    clearCart,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}
