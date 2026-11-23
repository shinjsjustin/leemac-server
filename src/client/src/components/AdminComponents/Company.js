import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../AdminLayout/AdminLayout';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api/apiFetch';

const BILL_TO_FIELDS = [
    { key: 'bill_to_name', placeholder: 'Bill-to name' },
    ...[1, 2, 3, 4, 5].map((n) => ({ key: `bill_to_line${n}`, placeholder: `Line ${n}` })),
];

// The table scrolls sideways inside its own box on a phone; the bill-to group sizes to that box's visible width
// (container query units) and stays pinned left, so it wraps to the screen, not to the wider table.
const TABLE_BOX_STYLE = { overflowX: 'auto', containerType: 'inline-size' };
const CELL_PADDING_X_PX = 30;
const BILL_TO_GROUP_STYLE = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
    position: 'sticky',
    left: 0,
    boxSizing: 'border-box',
    width: `calc(100cqi - ${CELL_PADDING_X_PX}px)`,
};
const BILL_TO_INPUT_STYLE = { flex: '1 1 160px', minWidth: 0, boxSizing: 'border-box' };

const Company = () => {
    const [companies, setCompanies] = useState([]);
    const [newCompany, setNewCompany] = useState({ code: '', name: '', address_line1: '', address_line2: '' });
    const navigate = useNavigate();

    const fetchCompanies = useCallback(async () => {
        try {
            const response = await apiFetch('/internal/company/getcompanies');
            const data = await response.json();
            if (response.status === 200) {
                setCompanies(data);
            } else {
                console.error(data);
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        fetchCompanies();
    }, [fetchCompanies]);

    const handleAddCompany = async () => {
        try {
            const response = await apiFetch('/internal/company/createcompany', {
                method: 'POST',
                body: newCompany,
            });
            const data = await response.json();
            if (response.status === 201) {
                alert('Company added successfully!');
                setNewCompany({ code: '', name: '', address_line1: '', address_line2: '' });
                fetchCompanies();
            } else {
                console.error(data);
                alert('Failed to add company.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while adding the company.');
        }
    };

    const handleEditCompany = async (id, updatedCompany) => {
        try {
            const response = await apiFetch(`/internal/company/editcompany/${id}`, {
                method: 'PUT',
                body: updatedCompany,
            });
            const data = await response.json();
            if (response.status === 200) {
                alert('Company updated successfully!');
                fetchCompanies();
            } else {
                console.error(data);
                alert('Failed to update company.');
            }
        } catch (e) {
            console.error(e);
            alert('An error occurred while updating the company.');
        }
    };

    return (
        <AdminLayout current="clients" crumb="Clients">
            <button onClick={() => navigate(-1)}>Back</button>
            <div className="requests">
                <h2>Companies</h2>
                <div>
                    <h3>Add New Company</h3>
                    <input
                        type="text"
                        placeholder="Code"
                        value={newCompany.code}
                        onChange={(e) => setNewCompany({ ...newCompany, code: e.target.value })}
                    />
                    <input
                        type="text"
                        placeholder="Name"
                        value={newCompany.name}
                        onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })}
                    />
                    <input
                        type="text"
                        placeholder="Address Line 1"
                        value={newCompany.address_line1}
                        onChange={(e) => setNewCompany({ ...newCompany, address_line1: e.target.value })}
                    />
                    <input
                        type="text"
                        placeholder="Address Line 2"
                        value={newCompany.address_line2}
                        onChange={(e) => setNewCompany({ ...newCompany, address_line2: e.target.value })}
                    />
                    <button onClick={handleAddCompany}>Add Company</button>
                </div>
                <div>
                    <h3>Company List</h3>
                    <div style={TABLE_BOX_STYLE}>
                    <table className="requests-table">
                        <thead>
                            <tr>
                                <th>Code</th>
                                <th>Name</th>
                                <th>Address Line 1</th>
                                <th>Address Line 2</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {companies.map((company) => (
                                <React.Fragment key={company.id}>
                                <tr>
                                    <td>
                                        <input
                                            type="text"
                                            value={company.code}
                                            onChange={(e) =>
                                                setCompanies(companies.map(c =>
                                                    c.id === company.id ? { ...c, code: e.target.value } : c
                                                ))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={company.name}
                                            onChange={(e) =>
                                                setCompanies(companies.map(c =>
                                                    c.id === company.id ? { ...c, name: e.target.value } : c
                                                ))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={company.address_line1}
                                            onChange={(e) =>
                                                setCompanies(companies.map(c =>
                                                    c.id === company.id ? { ...c, address_line1: e.target.value } : c
                                                ))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            value={company.address_line2}
                                            onChange={(e) =>
                                                setCompanies(companies.map(c =>
                                                    c.id === company.id ? { ...c, address_line2: e.target.value } : c
                                                ))
                                            }
                                        />
                                    </td>
                                    <td>
                                        <button onClick={() => handleEditCompany(company.id, company)}>Save</button>
                                    </td>
                                </tr>
                                <tr>
                                    <td colSpan={5}>
                                        <div style={BILL_TO_GROUP_STYLE}>
                                            <strong>Bill to (invoices only)</strong>
                                            {BILL_TO_FIELDS.map(({ key, placeholder }) => (
                                                <input
                                                    key={key}
                                                    type="text"
                                                    placeholder={placeholder}
                                                    style={BILL_TO_INPUT_STYLE}
                                                    value={company[key] ?? ''}
                                                    onChange={(e) =>
                                                        setCompanies(companies.map(c =>
                                                            c.id === company.id ? { ...c, [key]: e.target.value } : c
                                                        ))
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </td>
                                </tr>
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default Company;
