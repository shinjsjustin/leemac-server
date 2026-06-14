import React, { useState, useEffect, useCallback } from 'react';
import { jarvisFetch } from './jarvisApi';

const TodoApp = () => {
  const [todos, setTodos] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [completingIds, setCompletingIds] = useState(new Set());
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState(null);

  const fetchTodos = useCallback(async () => {
    try {
      const res = await jarvisFetch('/todos');
      const data = await res.json();
      if (res.ok) {
        setTodos(data);
      } else {
        setError(data.error || 'Failed to load todos.');
      }
    } catch (err) {
      setError('Network error loading todos.');
    }
  }, []);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  const handleAdd = async () => {
    const content = inputValue.trim();
    if (!content || isAdding) return;

    setIsAdding(true);
    setError(null);
    try {
      const res = await jarvisFetch('/todos', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (res.ok) {
        setTodos(prev => [...prev, data]);
        setInputValue('');
      } else {
        setError(data.error || 'Failed to add todo.');
      }
    } catch (err) {
      setError('Network error adding todo.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleAdd();
  };

  const handleDone = async (id) => {
    if (completingIds.has(id)) return;

    setCompletingIds(prev => new Set([...prev, id]));
    setError(null);
    try {
      const res = await jarvisFetch(`/todos/${id}`, { method: 'PATCH' });
      if (res.ok) {
        setTodos(prev =>
          prev.map(t => t.id === id ? { ...t, completed: true } : t)
        );
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to complete todo.');
      }
    } catch (err) {
      setError('Network error completing todo.');
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleClear = async () => {
    if (isClearing) return;
    setIsClearing(true);
    setError(null);
    try {
      const res = await jarvisFetch('/todos/clear', { method: 'POST' });
      if (res.ok) {
        setTodos(prev => prev.filter(t => !t.completed));
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to clear todos.');
      }
    } catch (err) {
      setError('Network error clearing todos.');
    } finally {
      setIsClearing(false);
    }
  };

  const hasDone = todos.some(t => t.completed);

  return (
    <div className="todo-container">
      <h3>To Do</h3>

      {error && (
        <div style={{ color: '#dc3545', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      <div className="todo-add-row">
        <input
          type="text"
          placeholder="Add a new task..."
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="todo-add-btn"
          onClick={handleAdd}
          disabled={isAdding || !inputValue.trim()}
        >
          {isAdding ? 'Adding...' : 'Add'}
        </button>
      </div>

      {todos.length === 0 ? (
        <p className="todo-empty">No tasks yet. Add one above!</p>
      ) : (
        <ul className="todo-list">
          {todos.map(todo => (
            <li key={todo.id} className={`todo-item${todo.completed ? ' done' : ''}`}>
              <span className="todo-item-content">{todo.content}</span>
              {todo.source === 'ai' && (
                <span className="todo-badge">AI</span>
              )}
              {!todo.completed && (
                <button
                  className="todo-done-btn"
                  onClick={() => handleDone(todo.id)}
                  disabled={completingIds.has(todo.id)}
                >
                  {completingIds.has(todo.id) ? '...' : 'Done'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {hasDone && (
        <button
          className="todo-clear-btn"
          onClick={handleClear}
          disabled={isClearing}
        >
          {isClearing ? 'Clearing...' : 'Clear Completed'}
        </button>
      )}
    </div>
  );
};

export default TodoApp;
