export const send = (res, data, status = 200) => res.status(status).json({ data });

export const sendPage = (res, rows, total, { page, page_size }) =>
  res.json({
    data: rows,
    meta: { page, page_size, total, total_pages: Math.ceil(total / page_size) },
  });
