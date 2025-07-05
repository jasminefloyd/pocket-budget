export default function AIInsightsScreen({ budget, setViewMode }) {
  // Calculate totals
  const totalIncome = budget.transactions
    .filter((t) => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpenses = budget.transactions
    .filter((t) => t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0)

  const savingsRate = totalIncome > 0 
    ? ((totalIncome - totalExpenses) / totalIncome) * 100 
    : 0

  const foodExpenses = budget.transactions
    .filter((t) => t.category.toLowerCase().includes("food") && t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0)

  const transportExpenses = budget.transactions
    .filter((t) => t.category.toLowerCase().includes("transport") && t.type === "expense")
    .reduce((sum, t) => sum + t.amount, 0)

  // Generate insights
  const insights = [
    {
      icon: "💡",
      title: "Smart Insight",
      description: foodExpenses > totalExpenses * 0.3
        ? `You're spending ${(foodExpenses / totalExpenses * 100).toFixed(1)}% of your expenses on food, which is above our 30% recommendation. Consider meal planning to reduce costs.`
        : `Your food spending is ${(foodExpenses / totalExpenses * 100).toFixed(1)}% of your expenses — within a healthy range.`
    },
    {
      icon: "✅",
      title: "Good Habit",
      description: transportExpenses < totalExpenses * 0.1
        ? `Your transport spending is low at ${(transportExpenses / totalExpenses * 100).toFixed(1)}% of your expenses. Great job on cost management!`
        : `Your transport costs are ${(transportExpenses / totalExpenses * 100).toFixed(1)}% of expenses. Consider carpooling or public transit to save more.`
    },
    {
      icon: "⚠️",
      title: "Recommendation",
      description: savingsRate < 20
        ? `Your savings rate is ${savingsRate.toFixed(1)}%. Aim for at least 20% to build a strong safety net.`
        : `Your savings rate is ${savingsRate.toFixed(1)}%. Nice work staying above the 20% savings benchmark!`
    },
    {
      icon: "🎯",
      title: "Goal Suggestion",
      description: totalIncome > 0
        ? `If you reduce entertainment by 10%, you could save an additional $${(totalIncome * 0.1).toFixed(2)} monthly.`
        : `Add income transactions to unlock goal suggestions!`
    },
    {
      icon: "📈",
      title: "Financial Forecast",
      description: totalIncome > totalExpenses
        ? `Expected savings over 3 months: <span class="income">+$${((totalIncome - totalExpenses) * 3).toFixed(2)}</span><br/>Risk level: <span class="warning">Low</span>`
        : `You're currently spending more than you earn. Review your budget to avoid a <span class="expense">high risk</span> of debt.`
    }
  ]

  return (
    <div>
      <button className="cancelButton secondary-button" onClick={() => setViewMode("details")}>
        <i className="fa-solid fa-left-long"></i> Back to Details
      </button>
      <h1 className="header">AI Finance Insights</h1>

      {insights.map((insight, idx) => (
        <div key={idx} className="insight-card">
          <div className="insight-content">
            <span className="insight-icon">{insight.icon}</span>
            <div className="insight-text">
              <strong>{insight.title}:</strong>
              <div
                className="insight-description"
                dangerouslySetInnerHTML={{ __html: insight.description }}
              ></div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
