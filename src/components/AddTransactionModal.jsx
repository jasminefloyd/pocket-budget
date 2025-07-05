import { useState } from 'react';

export default function AddTransactionModal({ show, onClose, onAdd }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState('expense');

  const handleAdd = () => {
    const amt = parseFloat(amount);
    if (name && !isNaN(amt)) {
      onAdd({ id: Date.now().toString(), name, amount: amt, type });
      setName('');
      setAmount('');
      setType('expense');
      onClose();
    }
  };

  if (!show) return null;

  return (
    <div className="modalBackdrop">
      <div className="modalContent">
        <h2 className="header">New Transaction</h2>
        <input
          className="input"
          placeholder="Description"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="input"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          type="number"
        />
        <div className="row">
          <button
            className={type === 'income' ? 'activeType' : 'inactiveType'}
            onClick={() => setType('income')}
          >
            Income
          </button>
          <button
            className={type === 'expense' ? 'activeType' : 'inactiveType'}
            onClick={() => setType('expense')}
          >
            Expense
          </button>
        </div>
        <button className="addButton" onClick={handleAdd}>Add</button>
        <button className="cancelButton" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
