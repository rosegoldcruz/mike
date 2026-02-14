
import tkinter as tk
from tkinter import ttk, messagebox, filedialog
import pandas as pd
import os

# --- Configuration & Logic ---
FACTOR = 0.126
BUILD_COST_PER_BOX = 20.0
HANDLE_PRICE = 2.75
SHIPPING_PER_UNIT = 125.0

class CabinetQuoterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Cabinet Quoter Pro - 1-2-3 Done")
        self.root.geometry("800x600")
        
        # Load Data
        try:
            self.albert_df = pd.read_csv('Albert_Master_Definitive.csv')
            self.hci_df = pd.read_csv('HCI_Master_Definitive.csv')
        except Exception as e:
            messagebox.showerror("Error", f"Could not load master files: {e}")
            self.root.destroy()
            return

        self.setup_ui()

    def setup_ui(self):
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)

        # 1. Selection Header
        header_frame = ttk.LabelFrame(main_frame, text="1. Project Setup", padding="10")
        header_frame.pack(fill=tk.X, pady=5)

        ttk.Label(header_frame, text="Style:").grid(row=0, column=0, sticky=tk.W)
        self.style_var = tk.StringVar(value="Frameless (Albert)")
        self.style_combo = ttk.Combobox(header_frame, textvariable=self.style_var, values=["Frameless (Albert)", "Framed (HCI)"])
        self.style_combo.grid(row=0, column=1, padx=5, sticky=tk.W)
        self.style_combo.bind("<<ComboboxSelected>>", self.update_finishes)

        ttk.Label(header_frame, text="Finish:").grid(row=0, column=2, sticky=tk.W, padx=10)
        self.finish_var = tk.StringVar()
        self.finish_combo = ttk.Combobox(header_frame, textvariable=self.finish_var)
        self.finish_combo.grid(row=0, column=3, padx=5, sticky=tk.W)
        self.update_finishes()

        ttk.Label(header_frame, text="Margin (%):").grid(row=0, column=4, sticky=tk.W, padx=10)
        self.margin_scale = tk.Scale(header_frame, from_=0, to=50, orient=tk.HORIZONTAL, length=150)
        self.margin_scale.set(0)
        self.margin_scale.grid(row=0, column=5, padx=5)

        # 2. Input
        input_frame = ttk.LabelFrame(main_frame, text="2. Unit Configuration", padding="10")
        input_frame.pack(fill=tk.BOTH, expand=True, pady=5)

        self.unit_text = tk.Text(input_frame, height=10)
        self.unit_text.pack(fill=tk.BOTH, expand=True)
        self.unit_text.insert(tk.END, "# Paste SKU list here (Format: SKU, Quantity)\nB12, 1\nSB36, 1\nW3030, 2")

        # 3. Actions & Results
        action_frame = ttk.Frame(main_frame)
        action_frame.pack(fill=tk.X, pady=5)

        ttk.Button(action_frame, text="RUN QUOTE", command=self.run_quote).pack(side=tk.LEFT, padx=5)
        ttk.Button(action_frame, text="UPLOAD ELEVATION (AI Simulation)", command=self.simulate_ocr).pack(side=tk.LEFT, padx=5)

        self.result_label = ttk.Label(main_frame, text="Total Project Bid: $0.00", font=("Arial", 16, "bold"))
        self.result_label.pack(pady=10)

    def update_finishes(self, event=None):
        if "Albert" in self.style_var.get():
            cols = [c for c in self.albert_df.columns if c != 'SKU']
        else:
            cols = [c for c in self.hci_df.columns if c != 'SKU']
        self.finish_combo['values'] = cols
        if cols: self.finish_combo.current(0)

    def run_quote(self):
        style = self.style_var.get()
        finish = self.finish_var.get()
        margin = self.margin_scale.get() / 100.0
        data = self.albert_df if "Albert" in style else self.hci_df

        lines = self.unit_text.get("1.0", tk.END).split('\n')
        total_list = 0
        box_count = 0
        
        for line in lines:
            if not line.strip() or line.startswith("#"): continue
            try:
                sku, qty = [x.strip() for x in line.split(',')]
                qty = float(qty)
                
                # Nomenclature handling
                price = 0
                if sku in data['SKU'].values:
                    price = data.loc[data['SKU'] == sku, finish].values[0]
                
                total_list += price * qty
                if any(p in sku.upper() for p in ['B', 'W', 'SB', 'DB', 'V', 'PC', 'MOC', 'FSB']):
                    box_count += qty
            except Exception as e:
                print(f"Error parsing line: {line} - {e}")

        # Mike Logic
        base_cost = (total_list * FACTOR) + (box_count * BUILD_COST_PER_BOX) + SHIPPING_PER_UNIT
        bid_price = base_cost / (1 - margin) if margin < 1 else base_cost
        
        self.result_label.config(text=f"Total Project Bid: ${bid_price:,.2f}")

    def simulate_ocr(self):
        messagebox.showinfo("AI Vision", "OCR Engine triggered. Analyzing PDF elevations...\n\nFound: 1x SB36, 1x B24, 2x W3030\nInserting into configuration.")
        self.unit_text.delete("1.0", tk.END)
        self.unit_text.insert(tk.END, "SB36, 1\nB24, 1\nW3030, 2")

if __name__ == "__main__":
    root = tk.Tk()
    app = CabinetQuoterApp(root)
    root.mainloop()
