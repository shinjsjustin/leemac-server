const loadJobSummary = async (db, id) => {
    const [jobRows] = await db.execute(
        `SELECT job.attention, job.job_number, job.company_id, job.po_number, job.po_date, job.created_at, 
                    job.due_date, job.ship_date, job.tax_code, job.tax, job.tax_percent, job.invoice_number, 
                    job.invoice_date, job.total_cost, job.subtotal, company.name AS company_name, company.code AS company_code, 
                    company.address_line1, company.address_line2
             FROM job
             JOIN company ON job.company_id = company.id
             WHERE job.id = ?`,
        [id]
    );

    if (jobRows.length === 0) return null;

    const [parts] = await db.execute(
        `SELECT part.id, part.number, job_part.id as job_part_id, job_part.price, job_part.rev, job_part.details, job_part.note, job_part.material, job_part.finish, job_part.stock_size, part.description, job_part.quantity
             FROM job_part
             JOIN part ON job_part.part_id = part.id
             WHERE job_part.job_id = ?`,
        [id]
    );

    return { job: jobRows[0], parts };
};

module.exports = { loadJobSummary };
