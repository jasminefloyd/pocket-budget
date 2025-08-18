"use client"

import { useState } from "react"

export default function AddTransactionModal({ show, onClose, onAdd }) {
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [type, setType] = useState("expense")
  const [receipt, setReceipt] = useState(null)

  const handleAdd = () => {
    const amt = Number.parseFloat(amount)
    if (name && !isNaN(amt)) {
      onAdd({
        id: Date.now().toString(),
        name: name.trim(),
        amount: amt,
        type,
        receipt,
      })
      // Reset form fields
      setName("")
      setAmount("")
      setType("expense")
      setReceipt(null)
      onClose()
    } else {
      alert("Please fill in all fields correctly.")
    }
  }

  if (!show) return null

  return (
    <div className="modalBackdrop">
      <div className="modalContent">
        <h2 className="header">New Transaction</h2>

        <input className="input" placeholder="Description" value={name} onChange={(e) => setName(e.target.value)} />

        <input
          className="input"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
        />

        <div className="row">
          <button className={type === "income" ? "activeType" : "inactiveType"} onClick={() => setType("income")}>
            Income
          </button>
          <button className={type === "expense" ? "activeType" : "inactiveType"} onClick={() => setType("expense")}>
            Expense
          </button>
        </div>

        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files[0]
            if (file) {
              const reader = new FileReader()
              reader.onloadend = () => {
                setReceipt(reader.result)
              }
              reader.readAsDataURL(file)
            }
          }}
        />

        <button className="addButton" onClick={handleAdd}>
          Add
        </button>
        <button className="cancelButton" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}
