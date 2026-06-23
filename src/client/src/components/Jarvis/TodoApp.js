import React, { useState, useEffect, useCallback } from 'react';
import { jarvisFetch } from './jarvisApi';

const TodoApp = () => {
  const [todos, setTodos] = useState([]);
  const [titleValue, setTitleValue] = useState('');
  const [descriptionValue, setDescriptionValue] = useState('');
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
    const title = titleValue.trim();
    const description = descriptionValue.trim();
    if (!title || isAdding) return;

    setIsAdding(true);
    setError(null);
    try {
      const res = await jarvisFetch('/todos', {
        method: 'POST',
        body: JSON.stringify({ title, description: description || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setTodos(prev => [data, ...prev]);
        setTitleValue('');
        setDescriptionValue('');
      } else {
        setError(data.error || 'Failed to add todo.');
      }
    } catch (err) {
      setError('Network error adding todo.');
    } finally {
      setIsAdding(false);
    }
  };

  const handleTitleKeyDown = (e) => {
    // Enter adds the task; Shift+Enter is reserved for the description field.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  const handleDone = async (id) => {
    if (completingIds.has(id)) return;

    setCompletingIds(prev => new Set([...prev, id]));
    setError(null);
    try {
      const res = await jarvisFetch(`/todos/${id}`, { method: 'PATCH' });
      if (res.ok) {
        const updated = await res.json();
        setTodos(prev => prev.map(t => (t.id === id ? updated : t)));
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
        setTodos(prev => prev.filter(t => !t.done));
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

  const hasDone = todos.some(t => t.done);

  return (
    <div className="todo-container">
      <h3>To Do</h3>

      {error && (
        <div style={{ color: '#dc3545', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}

      <div className="todo-add-card">
        <input
          className="todo-title-input"
          type="text"
          placeholder="Title — a quick summary of what needs to be done"
          value={titleValue}
          onChange={e => setTitleValue(e.target.value)}
          onKeyDown={handleTitleKeyDown}
        />
        <textarea
          className="todo-description-input"
          placeholder="Description (optional) — add more details"
          value={descriptionValue}
          onChange={e => setDescriptionValue(e.target.value)}
          rows={2}
        />
        <div className="todo-add-actions">
          <button
            className="todo-add-btn"
            onClick={handleAdd}
            disabled={isAdding || !titleValue.trim()}
          >
            {isAdding ? 'Adding...' : 'Add Task'}
          </button>
        </div>
      </div>

      {todos.length === 0 ? (
        <p className="todo-empty">No tasks yet. Add one above!</p>
      ) : (
        <ul className="todo-list">
          {todos.map(todo => (
            <li key={todo.id} className={`todo-item${todo.done ? ' done' : ''}`}>
              <div className="todo-item-main">
                <div className="todo-item-header">
                  <span className="todo-item-title">{todo.title || todo.content}</span>
                  {todo.source === 'ai' && (
                    <span className="todo-badge">AI</span>
                  )}
                </div>
                {todo.description && (
                  <p className="todo-item-description">{todo.description}</p>
                )}
              </div>
              {!todo.done && (
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
