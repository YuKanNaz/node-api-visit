const express = require('express');
const app = express();
const mysql = require('mysql2'); // แนะนำให้ใช้ mysql2 เพื่อความเร็วและรองรับ Promise
const cors = require('cors');

app.use(express.json());
app.use(cors());

// ---------------------------------------------------------
// 1. การเชื่อมต่อ Database (รองรับ TiDB บน Cloud และ Local)
// ---------------------------------------------------------
const db = mysql.createPool({
    connectionLimit: 10,
    // แก้ชื่อตัวแปรให้ตรงกับใน Vercel (TIDB_...)
    host: process.env.TIDB_HOST,      
    user: process.env.TIDB_USER,      
    password: process.env.TIDB_PASSWORD, 
    database: process.env.TIDB_DATABASE, // ใน Vercel คุณตั้งชื่อว่า TIDB_DATABASE
    port: process.env.TIDB_PORT || 4000, 
    ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
    },
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

// เช็คการเชื่อมต่อ (Log ดูใน Vercel Function Logs)
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database Connection Failed:', err.code);
        console.error(err);
    } else {
        console.log('✅ Database connected successfully!');
        connection.release();
    }
});

// ---------------------------------------------------------
// 2. Routes (API endpoints)
// ---------------------------------------------------------

app.get('/', (req, res) => {
    res.send("API Visit Prison System is Running...");
});

app.get('/user', (req, res) => {
    db.query("SELECT * FROM user", (err, result) => {
        if (err) return res.status(500).send(err);
        res.send(result);
    });
});

app.get('/notice', (req, res) => {
    db.query("SELECT * FROM announce", (err, result) => {
        if (err) return res.status(500).send({ message: "เกิดข้อผิดพลาดที่ Server" });
        res.send(result);
    });
});

app.get('/prisoner', (req, res) => {
    const name = req.query.name;
    // [FIX] แก้ไข Syntax ตรงนี้ เดิมเขียนผิด
    const searchTerm = `%${name}%`; 
    
    db.query("SELECT * FROM prisoner WHERE name LIKE ?", [searchTerm], (err, result) => {
        if (err) {
            console.log("ข้อผิดพลาด", err);
            res.status(500).json(err);
        } else {
            res.json(result);
        }
    });
});

// Login User: ใช้ name และ birthday
app.post('/login', (req, res) => {
    const { name, birthday } = req.body;
    db.query(
        "SELECT * FROM user WHERE name = ? AND birthday = ?",
        [name, birthday],
        (err, result) => {
            if (err) {
                res.status(500).send({ message: "เกิดข้อผิดพลาดที่ Server" });
            } else {
                if (result.length > 0) {
                    res.send({ message: "Login สำเร็จ!", user: result[0] });
                } else {
                    res.status(401).send({ message: "ชื่อหรือวันเกิดไม่ถูกต้อง" });
                }
            }
        }
    );
});

// Login Officer
app.post('/login-officer', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM officer WHERE username = ? AND password = ?";
    db.query(sql, [username, password], (err, result) => {
        if (err) return res.status(500).send({ message: "เกิดข้อผิดพลาดที่ server" });
        
        if (result.length > 0) {
            res.send({ message: "Login สำเร็จ!", user: result[0] });
        } else {
            res.status(401).send({ message: "ชื่อหรือรหัสไม่ถูกต้อง" });
        }
    })
})

// Login Admin
app.post('/login-admin', (req, res) => {
    const { name, password } = req.body;
    db.query(
        "SELECT * FROM admin WHERE username = ? AND password = ? ",
        [name, password],
        (err, result) => {
            if (err) return res.status(500).send({ message: "เกิดข้อผิดพลาดที่ Server" });
            
            if (result.length > 0) {
                res.send({ message: "Login สำเร็จ!", user: result[0] });
            } else {
                res.status(401).send({ message: "ชื่อหรือรหัสไม่ถูกต้อง" });
            }
        }
    )
})

app.put('/update-prisoner-status', (req, res) => {
    const { prisoner_id, status } = req.body;
    if (!prisoner_id) {
        return res.status(400).send({ message: "ไม่พบ prisoner_id ที่ส่งมา" });
    }
    const sql = "UPDATE prisoner SET status = ? WHERE prisoner_id = ?";
    db.query(sql, [status, prisoner_id], (err, result) => {
        if (err) return res.status(500).send({ message: "เกิดข้อผิดพลาดที่ Database" });
        
        if (result.affectedRows === 0) {
            return res.status(404).send({ message: "ไม่พบ ID นักโทษคนนี้ในระบบ" });
        }
        res.send({ message: "อัปเดตสถานะสำเร็จ!" });
    });
});

app.post('/book-visit', (req, res) => {
    const { prisoner_code, visitor_name, visit_date, visit_time, prisonerName, phone, relations, visit_day } = req.body;

    const sql = "INSERT INTO visits (prisoner_id, visitor_name, visit_date, visit_time, prisonerName, phone, relations, visit_day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";

    db.query(sql, [prisoner_code, visitor_name, visit_date, visit_time, prisonerName, phone, relations, visit_day], (err, result) => {
        if (err) {
            console.log(err);
            res.status(500).send({ message: "จองไม่สำเร็จ" });
        } else {
            res.send({ message: "จองเยี่ยมสำเร็จ รอการอนุมัติ!" });
        }
    });
});

// [FIX] เพิ่ม birthday ลงไปในการสมัครด้วย ไม่งั้น User จะ Login ไม่ได้
app.post("/register-user", (req, res) => {
    const { name, idCard, phone, email, birthday } = req.body; // รับ birthday มาด้วย

    // เช็คว่าส่งข้อมูลมาครบไหม
    if (!name || !idCard || !phone || !email || !birthday) {
        return res.status(400).json({
            status: "error",
            message: "กรุณากรอกข้อมูลให้ครบทุกช่อง (รวมถึงวันเกิด)",
        });
    }

    // เพิ่ม birthday ลงใน SQL
    const sql = `
    INSERT INTO user (name, id_card_number, phone, email, birthday)
    VALUES (?, ?, ?, ?, ?)
  `;

    db.query(sql, [name, idCard, phone, email, birthday], (err) => {
        if (err) {
            console.error("SQL Error:", err);
            if (err.code === "ER_DUP_ENTRY") {
                return res.status(409).json({
                    status: "error",
                    message: "เลขบัตรหรืออีเมลนี้ถูกใช้แล้ว",
                });
            }
            return res.status(500).json({
                status: "error",
                message: "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์",
            });
        }
        res.json({
            status: "success",
            message: "สมัครสมาชิกสำเร็จ (User)",
        });
    });
});


app.post("/register-officer", (req, res) => {
    const { nameof, username, password } = req.body;
    // [FIX] เปลี่ยน VALUE เป็น VALUES ให้ถูกต้องตามหลัก SQL
    const sql = "INSERT INTO officer (name, username, password) VALUES (?, ?, ?)";
    db.query(sql, [nameof, username, password], (err) => {
        if (err) {
            res.status(500).send({ message: "สมัครให้ officer ไม่สำเร็จ" })
        }
        else {
            res.send({ message: "สมัคร officer สำเร็จ" });
        };
    });
});

app.put("/puttext-officer", (req, res) => {
    const { Notice, createby } = req.body;
    const sql = "UPDATE announce SET createby = ?, Notice = ? WHERE ID = 1;";
    db.query(sql, [createby, Notice], (err) => {
        if (err) {
            res.status(500).send({ message: "ลงประกาศไม่สำเร็จ" });
        } else {
            res.send({ message: "ลงประกาศสำเร็จ" });
        }
    });
});

// ---------------------------------------------------------
// 3. Export และ Start Server
// ---------------------------------------------------------

// สำคัญมากสำหรับ Vercel: ต้อง Export app ออกไป
module.exports = app;

// สั่งให้ Listen เฉพาะตอนรันในเครื่อง (เพื่อไม่ให้ Error บน Vercel)
if (require.main === module) {
    app.listen(3001, () => {
        console.log('Server is running on port 3001');
    });
}