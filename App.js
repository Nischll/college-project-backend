const express = require('express');
// const oracledb = require('oracledb');
const cors = require('cors');
const dbConfig = require('./dbConfig'); 
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs'); 
const path = require('path');
const pool = require('./dbConfig');
const PDFDocument = require("pdfkit");

const JWT_SECRET = 'mySuperSecretKey@1234';
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// API to insert data into signup_details table
app.post('/signup', async (req, res) => {
  const { username, name, password } = req.body;

  try {
    const client = await pool.connect();
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await client.query(
      `INSERT INTO signup_details (username, name, password)
       VALUES ($1, $2, $3) RETURNING *`,
      [username, name, hashedPassword]
    );

    client.release();
    res.status(201).send({ message: 'User signed up successfully', user: result.rows[0] });
  } catch (err) {
    console.error('Error executing query:', err.message);
    res.status(500).send({ error: 'Failed to sign up user' });
  }
});


// Get all signup details
app.get('/signup/get/details', async (req, res) => {
  try {
    const result = await pool.query(`SELECT username, name, password, role FROM signup_details`);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No users found' });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error retrieving users:', err);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Get all admins
app.get('/signup/get/admins', async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, username, name, role FROM signup_details WHERE role = 'admin'`);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No admins found' });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error retrieving admins:', err);
    res.status(500).json({ error: 'Failed to retrieve admins' });
  }
});

// Get all users
app.get('/signup/get/users', async (req, res) => {
  try {
    const result = await pool.query(`SELECT id, username, name, role FROM signup_details WHERE role = 'user'`);

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No users found' });
    }

    res.status(200).json(result.rows);
  } catch (err) {
    console.error('Error retrieving users:', err);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});


// GET SPECIFIC DETAILS FROM SIGNUP TABLE
// app.get('/signup/get/:id', async (req, res) => {
//   const { id } = req.params; 
//   let connection;

//   try {
//     connection = await oracledb.getConnection(dbConfig);

//     // Query to fetch a specific user by id
//     const result = await connection.execute(
//       `SELECT username, name, password, role, id FROM signup_details WHERE id = :id`,
//       { id },
//       { outFormat: oracledb.OUT_FORMAT_OBJECT }
//     );

//     // Check if user is found
//     if (result.rows.length === 0) {
//       return res.status(404).send({ message: 'User not found' });
//     }

//     // Respond with the fetched data
//     res.status(200).send(result.rows[0]); // Send only the first matching user
//   } catch (err) {
//     console.error('Error executing query for user:', err);
//     res.status(500).send({ error: 'Failed to retrieve user details' });
//   } finally {
//     if (connection) {
//       await connection.close();
//     }
//   }
// });

// UPDATE SIGNUP TABLE
app.put('/signup/update/:id', async (req, res) => {
  const { id } = req.params; // Extract id from the URL
  const { username, name, role } = req.body; // Get new values except password

  try {
    const result = await pool.query(
      `UPDATE signup_details 
       SET username = $1, name = $2, role = $3 
       WHERE id = $4`,
      [username, name, role, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).send({ message: 'User not found or no changes made' });
    }

    res.status(200).send({ message: 'User details updated successfully' });
  } catch (err) {
    console.error('Error executing update query:', err);
    res.status(500).send({ error: 'Failed to update user details' });
  }
});

app.delete('/signup/delete/:id', async (req, res) => {
  const { id } = req.params; // Get id from URL

  try {
    const result = await pool.query(`DELETE FROM signup_details WHERE id = $1`, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});



// Login API
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  let client;

  try {
    // Acquire a client from the pool
    client = await pool.connect();

    // Query to find user by username
    const result = await client.query(
      `SELECT username, password, role FROM signup_details WHERE username = $1`,
      [username]
    );

    if (result.rows.length === 0) {
      // User not found
      return res.status(404).send({ error: 'User not found' });
    }

    // Extract the username, password, and role from the result
    const { username: dbusername, password: dbPassword, role } = result.rows[0];

    // Compare entered password with the hashed password
    const isPasswordMatch = await bcrypt.compare(password, dbPassword);

    if (!isPasswordMatch) {
      return res.status(401).send({ error: 'Invalid username or password' });
    }

    // Generate JWT token
    const token = jwt.sign({ username: dbusername, role }, JWT_SECRET, { expiresIn: '1h' });

    // Success: Send response with token and user details
    res.status(200).send({
      message: 'Login successful',
      token,
      user: { username: dbusername, role }
    });
  } catch (err) {
    console.error('Error during login:', err);
    res.status(500).send({ error: 'Failed to login' });
  } finally {
    // Release the client back to the pool
    if (client) {
      client.release();
    }
  }
});


// ADD PRODUCT
// Multer setup for image upload (image will be uploaded to server)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Set the destination folder for image uploads
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Add a timestamp to the filename
  }
});
const upload = multer({ storage });

app.post('/products', async (req, res) => {
  const { product_name, category, buying_price, quantity, unit, expiry_date } = req.body;

  // Check if required fields are provided
  if (!product_name || !buying_price || !quantity || !expiry_date) {
    return res.status(400).json({ error: "Missing required fields: product_name, buying_price, quantity, or expiry_date." });
  }

  let client;
  try {
    client = await pool.connect();

    // Check if product with the same name and price already exists
    const checkQuery = 'SELECT * FROM products WHERE product_name = $1 AND buying_price = $2 LIMIT 1;';
    const checkValues = [product_name, buying_price];
    const checkResult = await client.query(checkQuery, checkValues);

    if (checkResult.rows.length > 0) {
      // Product exists with the same name and price
      const existingProduct = checkResult.rows[0];

      // Compare the expiry dates
      if (existingProduct.expiry_date === expiry_date) {
        return res.status(409).json({ error: 'Product with the same name and price already exists with the same expiry date.' });
      }
      
      // If expiry date is different, insert the new product
      const query = `
        INSERT INTO products (product_name, category, buying_price, quantity, unit, expiry_date)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
      `;

      const values = [product_name, category, buying_price, quantity, unit, expiry_date];
      const result = await client.query(query, values);

      return res.status(201).json({ message: 'Product added successfully with a different expiry date', product: result.rows[0] });
    }

    // If no matching product exists, insert the new product
    const query = `
      INSERT INTO products (product_name, category, buying_price, quantity, unit, expiry_date)
      VALUES ($1, $2, $3, $4, $5, $6) RETURNING *;
    `;
    const values = [product_name, category, buying_price, quantity, unit, expiry_date];

    const result = await client.query(query, values);

    res.status(201).json({ message: 'Product added successfully', product: result.rows[0] });

  } catch (err) {
    console.error('Error inserting product:', err);
    res.status(500).json({ error: 'Failed to add product' });

  } finally {
    if (client) {
      client.release(); // Release connection back to pool
    }
  }
});

// API to fetch product data from the database
app.get('/getProducts', async (req, res) => {
  let client;
  
  try {
    client = await pool.connect();

    // Query to fetch all data from the products table
    const result = await client.query(
      `SELECT product_id, product_name, category, buying_price, quantity, unit, 
              TO_CHAR(expiry_date, 'YYYY-MM-DD') AS expiry_date 
       FROM products`
    );

    res.status(200).json(result.rows); // Send the data to the client
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  } finally {
    if (client) {
      client.release(); // Release connection back to the pool
    }
  }
});

app.put('/products/:id', async (req, res) => {
  const { id } = req.params;
  const { product_name, category, buying_price, quantity, unit, expiry_date } = req.body;

  if (!product_name || !buying_price || !quantity || !expiry_date) {
    return res.status(400).json({ error: "Missing required fields: product_name, buying_price, quantity, expiry_date" });
  }

  let client;
  try {
    client = await pool.connect();

    const query = `
      UPDATE products
      SET product_name = $1, category = $2, buying_price = $3, quantity = $4, unit = $5, expiry_date = $6
      WHERE product_id = $7
      RETURNING *;
    `;

    const values = [product_name, category, buying_price, quantity, unit, expiry_date, id];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.status(200).json({ message: 'Product updated successfully', product: result.rows[0] });

  } catch (err) {
    console.error('Error updating product:', err);
    res.status(500).json({ error: 'Failed to update product' });
  } finally {
    if (client) {
      client.release();
    }
  }
});



// TOTAL NUMBER OF CATEOGORY FROM PRODUCT
// Get the count of distinct product categories
app.get('/product/category/count', async (req, res) => {
  try {
    const result = await pool.query(`SELECT COUNT(DISTINCT category) AS no_of_category FROM products`);

    if (result.rows.length > 0) {
      res.json({ no_of_category: result.rows[0].no_of_category });
    } else {
      res.status(404).json({ error: 'No data found' });
    }
  } catch (error) {
    console.error("Error fetching category count:", error);
    res.status(500).json({ error: 'Failed to fetch category count' });
  }
});

// Get the total number of products
app.get('/product/count', async (req, res) => {
  try {
    const result = await pool.query(`SELECT COUNT(*) AS no_of_product FROM products`);

    if (result.rows.length > 0) {
      res.json({ no_of_product: result.rows[0].no_of_product });
    } else {
      res.status(404).json({ error: 'No data found' });
    }
  } catch (error) {
    console.error("Error fetching product count:", error);
    res.status(500).json({ error: 'Failed to fetch product count' });
  }
});

// Get the total amount of all available products
app.get('/product/amount', async (req, res) => {
  try {
    const result = await pool.query(`SELECT SUM(quantity * buying_price) AS total_amount FROM products`);

    if (result.rows.length > 0) {
      res.json({ total_product_amount: result.rows[0].total_amount });
    } else {
      res.status(404).json({ error: 'No data found' });
    }
  } catch (error) {
    console.error("Error fetching total product amount:", error);
    res.status(500).json({ error: 'Failed to fetch total product amount' });
  }
});

// Get the total number of low stock products
app.get('/product/stocks/low', async (req, res) => {
  try {
    const result = await pool.query(`SELECT COUNT(*) AS low_stock_count FROM products WHERE quantity <= 10`);

    if (result.rows.length > 0) {
      res.json({ total_low_stocks: result.rows[0].low_stock_count });
    } else {
      res.status(404).json({ error: 'No data found' });
    }
  } catch (error) {
    console.error("Error fetching low stock count:", error);
    res.status(500).json({ error: 'Failed to fetch low stock count' });
  }
});

app.get('/sales/summary/last7days', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(id) AS no_of_sales_transaction,
        COALESCE(SUM(total_price), 0) AS total_sales_amount
      FROM 
        sales
      WHERE 
        sale_date >= NOW() - INTERVAL '7 days'
    `);

    if (result.rows.length > 0) {
      res.json({
        no_of_sales_transaction: result.rows[0].no_of_sales_transaction,
        total_sales_amount: result.rows[0].total_sales_amount
      });
    } else {
      res.status(404).json({ error: 'No sales data found in the last 7 days' });
    }
  } catch (error) {
    console.error("Error fetching sales summary:", error);
    res.status(500).json({ error: 'Failed to fetch sales summary' });
  }
});



// SALES API
app.post("/sales", async (req, res) => {
  const { cart } = req.body;

  try {
    for (let item of cart) {
      const { product_name, soldQuantity, buying_price, category, expiry_date, unit } = item;

      // Convert quantity based on unit type
      let formattedSoldQuantity = unit === "kg" ? parseFloat(soldQuantity) : parseInt(soldQuantity, 10);
      
      if (isNaN(formattedSoldQuantity)) {
        return res.status(400).json({ message: `Invalid quantity for ${product_name}` });
      }

      const total_price = parseFloat(buying_price) * formattedSoldQuantity;

      // Check Stock Before Selling
      const product = await pool.query(
        `SELECT quantity, expiry_date FROM products WHERE product_name = $1`,
        [product_name]
      );

      const stockQuantity = parseFloat(product.rows[0].quantity);  // Ensure quantity supports decimals
      const expiryDate = new Date(product.rows[0].expiry_date);
      const today = new Date();
      const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));

      // Expired Product Check
      if (expiryDate < today) {
        return res.status(400).json({ message: `${product_name} is Expired! Cannot Sell 🚫` });
      }

      // Low Stock Check
      if (stockQuantity < formattedSoldQuantity) {
        return res.status(400).json({ message: `${product_name} is Out of Stock!` });
      }

      // Expiring Soon Check
      if (diffDays <= 3) {
        return res.status(400).json({ message: `${product_name} is Expiring Soon! Only ${diffDays} days left.` });
      }

      // Insert into Sales Table
      await pool.query(
        `INSERT INTO sales (product_name, sold_quantity, total_price, category, expiry_date, unit)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [product_name, formattedSoldQuantity, total_price, category, expiry_date, unit]
      );

      // Reduce Stock Quantity
      await pool.query(
        `UPDATE products SET quantity = quantity - $1 WHERE product_name = $2 AND quantity >= $1`,
        [formattedSoldQuantity, product_name]
      );
    }

    res.status(201).json({ message: "Sales Recorded Successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to Record Sales" });
  }
});

app.get("/sales", async (req, res) => {
  const { days } = req.query;

  try {
    let query = `SELECT * FROM sales ORDER BY sale_date DESC`;

    if (days) {
      query = `SELECT * FROM sales WHERE sale_date >= CURRENT_DATE - INTERVAL '${days} days' ORDER BY sale_date DESC`;
    }

    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("❌ Error Fetching Sales:", error);
    res.status(500).json({ message: "Failed to Fetch Sales" });
  }
});


// SALES REPORT
const folderPath = "./reports";
if (!fs.existsSync(folderPath)) {
  fs.mkdirSync(folderPath);
  console.log("📄 Reports Folder Created Automatically");
}

const generateReport = async (title, data, filename, res) => {
  const doc = new PDFDocument({ margin: 30, size: "A4" });
  const stream = fs.createWriteStream(`${folderPath}/${filename}`);

  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  res.setHeader("Content-Type", "application/pdf");

  doc.pipe(stream);
  doc.pipe(res);

  title = title.replace(/[^\x00-\x7F]+/g, ""); // Remove Special Characters

  if (title.includes("Monthly Sales Report")) {
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthNumber = title.match(/\d+/)[0];
    const monthName = monthNames[parseInt(monthNumber) - 1];
    title = `Monthly Sales Report for ${monthName}`;
  }

  doc.font("Helvetica-Bold").fontSize(18).text(title, { align: "center" });
  doc.text(`Date: ${new Date().toLocaleString("en-IN")}`, { align: "center" });
  doc.moveDown(1);
  doc.text("------------------------------------------------------", { align: "center" });

  const y = doc.y; 

  doc.font("Helvetica-Bold").fontSize(12);
  doc.text("S.N.", 50, y, { align: "left" });
  doc.text("Product Name", 100, y, {  align: "left" });
  doc.text("Quantity", 200, y, { align: "left" });
  doc.text("Date & Time", 270, y, { width:100, align: "center" });
  doc.text("Price (Rs.)", 370, y, {  align: "center" });
  
  doc.moveDown(1);

  let total = 0;

  data.forEach((sale, index) => {
    const { product_name, sold_quantity, total_price, sale_date } = sale;
    total += parseFloat(total_price);
    const y = doc.y; 

    doc.font("Helvetica").fontSize(11);
    doc.text(index + 1, 50, y, { align: "left" });
    doc.text(product_name, 100, y, { align: "left" });
    doc.text(sold_quantity.toString(), 200, y, { align: "left" });
    doc.text(sale_date, 270, y, { width:150, align: "center" });
    doc.text(`Rs. ${total_price}`, 370, y, {  align: "center" });

    doc.moveDown(1)
  });

  doc.moveDown(1);
  doc.text("-------------------------------------------------", { align: "center" });
  doc.font("Helvetica-Bold").fontSize(12).text(`Grand Total: Rs. ${total}`, { align: "center" });

  doc.end();
  console.log(`✅ ${title} Generated`);
};



app.get("/sales/daily/report", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT product_name, sold_quantity, total_price, sale_date 
       FROM sales 
       WHERE sale_date::DATE = CURRENT_DATE 
       ORDER BY sale_date DESC`
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No Sales Found Today 😓" });
    }

    const filename = `daily_report_${Date.now()}.pdf`;
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    generateReport("🔥 Daily Sales Report", result.rows, filename, res);
  } catch (error) {
    console.error("❌ Daily Report Error:", error);
    res.status(500).json({ message: "Failed to Generate Daily Report" });
  }
});


// ---------------- MONTHLY REPORT ----------------
app.get("/sales/monthly/report/:month", async (req, res) => {
  const { month } = req.params;
  try {
    const result = await pool.query(
      `SELECT product_name, sold_quantity, total_price, sale_date 
       FROM sales 
       WHERE EXTRACT(MONTH FROM sale_date) = $1 
       AND EXTRACT(YEAR FROM sale_date) = EXTRACT(YEAR FROM CURRENT_DATE)
       ORDER BY sale_date DESC`,
      [month]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: `No Sales Found for Month ${month} 😓` });
    }

    const filename = `monthly_report_${month}_${Date.now()}.pdf`;
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    generateReport(`📅 Monthly Sales Report for ${month}`, result.rows, filename, res);
  } catch (error) {
    console.error("❌ Monthly Report Error:", error);
    res.status(500).json({ message: "Failed to Generate Monthly Report" });
  }
});

app.get("/sales/yearly/report/:year", async (req, res) => {
  const { year } = req.params;
  try {
    const result = await pool.query(
      `SELECT product_name, sold_quantity, total_price, sale_date 
       FROM sales 
       WHERE EXTRACT(YEAR FROM sale_date) = $1
       ORDER BY sale_date DESC`,
      [year]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: `No Sales Found for Year ${year} 😓` });
    }

    const filename = `yearly_report_${year}_${Date.now()}.pdf`;
    res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
    generateReport(`📆 Yearly Sales Report for Year ${year}`, result.rows, filename, res);
  } catch (error) {
    console.error("❌ Yearly Report Error:", error);
    res.status(500).json({ message: "Failed to Generate Yearly Report" });
  }
});

// POST API to Insert Payment Data
app.post("/api/payments", async (req, res) => {
  try {
    const { total_price } = req.body;

    if (!total_price || isNaN(total_price)) {
      return res.status(400).json({ error: "Invalid total_price" });
    }

    const query = "INSERT INTO payments (total_price) VALUES ($1) RETURNING *";
    const values = [total_price];

    const result = await pool.query(query, values);

    res.status(201).json({ message: "Payment added successfully", payment: {
      ...result.rows[0],
      date_time: new Date(result.rows[0].date_time).toLocaleString() // Convert to local time
    } });
  } catch (error) {
    console.error("Error inserting payment:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});




// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

