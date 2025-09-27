import React from 'react';

const ErrorScreen = ({ message, onRetry }) => {
    return (
        <div>
            <h2>Error!</h2>
            <p>{message}</p>
            <button onClick={onRetry}>Retry</button>
        </div>
    );
};

export default ErrorScreen;