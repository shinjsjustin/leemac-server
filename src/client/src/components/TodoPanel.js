import React from 'react';
import TodoApp from './Jarvis/TodoApp';
import './Styling/TodoPanel.css';

const TodoPanel = ({ onClose }) => {
    return (
        <div
            className="todo-panel-background"
            onClick={onClose}
        >
            <div
                className="todo-panel"
                onClick={e => e.stopPropagation()}
            >
                <div className="todo-panel-header">
                    <h2>To Do</h2>
                    <button
                        className="todo-panel-close"
                        onClick={onClose}
                        aria-label="Close to do list"
                    >
                        &times;
                    </button>
                </div>
                <div className="todo-panel-body">
                    <TodoApp />
                </div>
            </div>
        </div>
    );
};

export default TodoPanel;
