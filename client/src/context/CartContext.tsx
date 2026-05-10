import { createContext, useContext, useState, ReactNode } from "react";
import type { Product } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { useCustomer } from "@/context/CustomerContext";

export interface CartItem extends Omit<Product, 'id'> {
  id: number;
  quantity: number;
  instruction?: string;
  isCombo?: boolean;
  originalId?: string;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product | CartItem, quantity?: number, openCart?: boolean) => void;
  removeFromCart: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  updateInstruction: (productId: number, instruction: string) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { toast } = useToast();
  const { customer, openLoginModal } = useCustomer();

  const addToCart = (product: Product | CartItem, quantity = 1, openCart = false) => {
    if (!customer) {
      openLoginModal();
      return;
    }

    setItems((current) => {
      const existing = current.find((i) => i.id === product.id);
      if (existing) {
        return current.map((i) =>
          i.id === product.id ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...current, { ...product, quantity }];
    });
    toast({
      title: "Added to order",
      description: `${quantity}x ${product.name} added.`,
      duration: 2000,
    });
    if (openCart) setIsCartOpen(true);
  };

  const removeFromCart = (productId: number) => {
    setItems((current) => current.filter((i) => i.id !== productId));
  };

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity < 1) {
      removeFromCart(productId);
      return;
    }
    setItems((current) =>
      current.map((i) => (i.id === productId ? { ...i, quantity } : i))
    );
  };

  const updateInstruction = (productId: number, instruction: string) => {
    setItems((current) =>
      current.map((i) => (i.id === productId ? { ...i, instruction } : i))
    );
  };

  const clearCart = () => {
    setItems([]);
  };

  const totalItems = items.reduce((acc, item) => acc + item.quantity, 0);
  const totalPrice = items.reduce(
    (acc, item) => acc + (item.price || 0) * item.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQuantity,
        updateInstruction,
        clearCart,
        totalItems,
        totalPrice,
        isCartOpen,
        setIsCartOpen,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}
