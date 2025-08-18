export default function LoadingScreen({ message = "Loading" }) {
  return (
    <div className="loading-screen">
      <div className="loading-content">
        <h1 className="header">Pocket Budget</h1>
        <div className="loading-spinner-large"></div>
        <p className="loading-text">{message}...</p>
      </div>
    </div>
  )
}
