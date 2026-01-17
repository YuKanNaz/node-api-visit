const express = require('express');
const app = express();
const mysql = require('mysql2');
const cors = require('cors');

app.use(express.json());
app.use(cors());

// 1. แก้ไขการเชื่อมต่อ Database ให้รองรับทั้ง Cloud (Aiven) และ Localhost
// เปลี่ยนจาก createConnection เป็น createPool เพื่อความเสถียรบน Cloud
const db = mysql.createPool({
    connectionLimit: 10,
    host: process.env.DB_HOST || "localhost",      // อ่านค่าจาก Vercel หรือใช้ localhost
    user: process.env.DB_USER || "root",           // อ่านค่าจาก Vercel หรือใช้ root
    password: process.env.DB_PASSWORD || "Shiro11500", // อ่านค่าจาก Vercel หรือใช้รหัสเดิม
    database: process.env.DB_NAME || "gameing_shop",   // อ่านค่าจาก Vercel หรือใช้ชื่อเดิม
    port: process.env.DB_PORT || 3306,    
    ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  }          // อ่านค่าจาก Vercel หรือใช้ 3306
});

// เพิ่มตัวเช็คว่าเชื่อมต่อได้ไหม (เอาไว้ดูใน Log)
db.getConnection((err, connection) => {
    if (err) {
        console.error('Error connecting to database:', err.code);
        console.error('Error info:', err);
    } else {
        console.log('Database connected successfully!');
        connection.release(); // คืน Connection กลับเข้า Pool
    }
});


app.get('/user', (req, res) => {
    db.query("SELECT * FROM user", (err, result) => {
        if (err) {
            console.log(err);
            res.status(500).send(err);
        } else {
            res.send(result);
        }
    });
});

app.get('/notice', (req, res) => {
    db.query("SELECT * FROM announce", (err, result) => {
        if (err) {
            res.status(500).send({ message: "เกิดข้อผิดพลาดที่ Server" });
        } else {
            res.send(result);
        }
    });
});

app.get('/prisoner', (req, res) => {
    const name = req.query.name;
    // แก้ไข Syntax นิดหน่อยให้ปลอดภัยขึ้น
    db.query("SELECT * FROM prisoner WHERE name LIKE ?", [`%${name}%`], (err, result) => {
        if (err) {
            console.log("ข้อผิดพลาด", err);
            res.status(500).json(err);
        } else {
            res.json(result);
        }
    });
});

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

app.post('/login-officer', (req, res) => {
    const { username, password } = req.body;
    const sql = "SELECT * FROM officer WHERE username = ? AND password = ?";
    db.query(sql, [username, password], (err, result) => {
        if (err) {
            res.status(500).send({ message: "เกิดข้อผิดพลาดที่ server" })
        }
        else {
            if (result.length > 0) {
                res.send({ message: "Login สำเร็จ!", user: result[0] });
            } else {
                res.status(401).send({ message: "ชื่อหรือรหัสไม่ถูกต้อง" });
            }
        }
    })
})

app.post('/login-admin', (req, res) => {
    const { name, password } = req.body;
    db.query(
        "SELECT * FROM admin WHERE username = ? AND password = ? ",
        [name, password],
        (err, result) => {
            if (err) {
                res.status(500).send({ message: "เกิดข้อผิดพลาดที่ Server" });
            } else {
                if (result.length > 0) {
                    res.send({ message: "Login สำเร็จ!", user: result[0] });
                } else {
                    res.status(401).send({ message: "ชื่อหรือรหัสไม่ถูกต้อง" });
                }

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
        if (err) {
            return res.status(500).send({ message: "เกิดข้อผิดพลาดที่ Database" });
        }
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

app.post("/register-user", (req, res) => {
    const { name, idCard, phone, email } = req.body;

    if (!name || !idCard || !phone || !email) {
        return res.status(400).json({
            status: "error",
            message: "กรุณากรอกข้อมูลให้ครบทุกช่อง",
        });
    }

    const sql = `
    INSERT INTO user (name, id_card_number, phone, email)
    VALUES (?, ?, ?, ?)
  `;

    db.query(sql, [name, idCard, phone, email], (err) => {
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
    const sql = "INSERT INTO officer (name, username, password) VALUE (?, ?, ?)";
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

// 2. สำคัญมากสำหรับ Vercel: ต้อง Export app ออกไป
module.exports = app;

// 3. สั่งให้ Listen เฉพาะตอนรันในเครื่อง (เพื่อไม่ให้ Error บน Vercel)
if (require.main === module) {
    app.listen(3001, () => {
        console.log('Server is running on port 3001');
    });
}