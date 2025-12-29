const express = require("express");
const path = require("path");
const port = 3000;

// Creating the Express server
const app = express();
const fs = require('fs');
const multer = require('multer');
const QRCode = require('qrcode');
const generatePayload = require('promptpay-qr');
const _ = require('lodash');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const socketIo = require('socket.io');
const server = http.createServer(app);
const io = socketIo(server);

const db = new sqlite3.Database('Cinema_database.db', (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to SQLite database');
    }
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
    secret: 'your_secret_key', // เปลี่ยนเป็นค่า secret ที่คุณต้องการ
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // ถ้าคุณใช้งาน HTTPS ให้เปลี่ยนเป็น true
}));
app.use((req, res, next) => {
    req.db = db; // กำหนด db ให้กับ req
    next(); // ดำเนินการต่อไปยัง middleware ถัดไป
});
// static resourse & templating engine
app.use(express.static('public'));
// Set EJS as templating engine
app.set('view engine', 'ejs');

// routing path
//ล็อกอิน/สมัครสมาชิก
app.get('/register', function (req, res) {
    res.sendFile(path.join(__dirname, "/public/form-register.html"));
});
app.get('/login', function (req, res) {
    res.sendFile(path.join(__dirname, "/public/login.html"));
});
app.get('/process_get', function (req, res) {
    let formdata = {
        username: req.query.username,
        password: req.query.password,
        email: req.query.email,
        address: req.query.address,
        phone: req.query.phone
    };
    console.log(formdata);

    // Check if email exists
    const emailCheckQuery = 'SELECT * FROM customer WHERE Email = ?';
    db.get(emailCheckQuery, [formdata.email], (err, userByEmail) => {
        if (err) {
            console.error("Database error:", err);
            res.status(500).json({ status: "error", message: "Internal Server Error" });
            return;
        }
        if (userByEmail) {
            res.json({ status: "fail", message: "Email นี้เคยสมัครไว้แล้ว" });
        } else {
            // Check if username exists
            const usernameCheckQuery = 'SELECT * FROM customer WHERE Username = ?';
            db.get(usernameCheckQuery, [formdata.username], (err, userByUsername) => {
                if (err) {
                    console.error("Database error:", err);
                    res.status(500).json({ status: "error", message: "Internal Server Error" });
                    return;
                }
                if (userByUsername) {
                    res.json({ status: "fail", message: "ชื่อผู้ใช้ นี้ถูกใช้งานแล้ว กรุณาเปลี่ยนชื่อผู้ใช้" });
                } else {
                    // Insert new user
                    const insertQuery = 'INSERT INTO customer (Username, Password, Email, Address, PhoneNumber) VALUES (?, ?, ?, ?, ?)';
                    db.run(insertQuery, [formdata.username, formdata.password, formdata.email, formdata.address, formdata.phone], (err) => {
                        if (err) {
                            console.error("Database error:", err);
                            res.status(500).json({ status: "error", message: "Internal Server Error" });
                            return;
                        }
                        console.log("A record inserted");
                        res.json({ status: "success", message: "สมัครสมาชิกสำเร็จ" });
                    });
                }
            });
        }
    });
});

app.post('/process_login', function (req, res) {
    const { username, password } = req.body;

    // Query that checks both username and email
    const userQuery = 'SELECT * FROM customer WHERE Username = ? OR Email = ?';
    db.get(userQuery, [username, username], (err, userResult) => { // Use username parameter twice
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ status: "error", message: "Internal Server Error" });
        }
        if (!userResult) {
            // If no customer found, check the employee table
            const employeeQuery = 'SELECT employee.*, department.DepartmentID FROM employee JOIN department ON employee.DepartmentID = department.DepartmentID WHERE Username = ? OR Email = ?';
            db.get(employeeQuery, [username, username], (err, employeeResult) => { // Use username parameter twice
                if (err) {
                    console.error("Database error:", err);
                    return res.status(500).json({ status: "error", message: "Internal Server Error" });
                }
                if (!employeeResult) {
                    return res.status(401).json({ status: "fail", message: "ไม่พบชื่อผู้ใช้" });
                } else {
                    if (employeeResult.Password === password) {
                        req.session.role = {
                            username: employeeResult.Username,
                            employeeID: employeeResult.EmployeeID,
                            department: employeeResult.DepartmentID,
                        };
                        let redirectPath = determineRedirect(employeeResult.DepartmentID);
                        console.log(req.session.role);
                        return res.json({ status: "success", role: req.session.role, redirect: redirectPath });
                    } else {
                        return res.status(401).json({ status: "fail", message: "รหัสผ่านไม่ถูกต้อง" });
                    }
                }
            });
        } else {
            // Check password for customer
            if (userResult.Password === password) {
                req.session.role = {
                    CustomerID: userResult.CustomerID,
                    username: userResult.Username,
                };
                console.log(req.session.role);
                return res.json({ status: "success", role: req.session.role, redirect: '/main' });
            } else {
                return res.status(401).json({ status: "fail", message: "รหัสผ่านไม่ถูกต้อง" });
            }
        }
    });
});

// เพิ่มฟังก์ชัน determineRedirect
function determineRedirect(departmentId) {
    switch (departmentId) {
        case "1":
            console.log('สวัสดีพนักงานเคาท์เตอร์')
            return '/main';
        case "2":
            console.log('สวัสดีบรรณาธิการ')
            return '/main_bun';
        case "3":
            console.log('สวัสดีพนักงานตรวจตั๋ว')
            return '/main';
        default:
            return '/unknown-department';
    }
}
//ลงชื่อออก
app.get('/logout', function (req, res) {
    // ลบข้อมูลในเซสชัน
    req.session.destroy(err => {
        if (err) {
            console.error("Session destruction error:", err);
            return res.status(500).json({ status: "error", message: "Internal Server Error" });
        }
        // ส่งผู้ใช้กลับไปยังหน้าหลักหรือหน้าล็อกอิน
        console.log('ลงชื่อออกแล้ว')
        res.redirect('/login'); // เปลี่ยนเส้นทางตามที่คุณต้องการ
    });
});

// หนัาหลัก
app.get('/main', function (req, res) {
    const users = req.session.role;
    const sql = 'SELECT * FROM movie ORDER BY Rating DESC';
    db.all(sql, [], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send("Database error");
        } else {
            res.render('main', { data: result, user: users });
        }
    });
});

// หนัาภาพยนตร์
app.get('/movie', function (req, res) {
    const users = req.session.role;
    const sql = 'SELECT * FROM movie;';

    req.db.all(sql, [], (err, rows) => {
        if (err) throw err;
        res.render('movie', { data: rows, user: users });
    });
});

//อธิบายภาพนตร์
app.get('/detail', function (req, res) {
    const MovieId = req.query.MovieID;
    const users = req.session.role;
    const sql = `SELECT * FROM movie WHERE MovieId = ?;`;
    req.db.get(sql, [MovieId], (err, row) => {
        if (err) throw err;
        res.render('detail', { data: [row], user: users });
    });
});


//ดูประวัติภาพยนตร์
app.get('/allhistory', function (req, res) {
    const users = req.session.role;
    let customerID = users ? users.CustomerID : null;
    let employeeID = users ? users.employeeID : null;
    let departmentID = users ? users.department : null;
    let sql;
    let params = [];

    if (customerID) {
        // Query สำหรับลูกค้า
        sql = `
            SELECT 
                CUSTOMER.Username,
                MOVIE.MovieID,
                MOVIE.Title,
                MOVIE.Genre,
                MOVIE.Duration,
                MOVIE.Director,
                MOVIE.Rating,
                MOVIE.ReleaseDate,
                MOVIE.Synopsis,
                CINEMA.Name AS CinemaName,
                CINEMA.Location,
                CINEMA.Capacity,
                SEAT.SeatID,
                TICKET.TicketID,
                TICKET.price,
                TICKET.Qrcode,
                TICKET.SeatNumber,
                SHOWTIME.ShowtimeID,
                SHOWTIME.Showtime,
                SHOWTIME.Showdate,
                BOOKING.BookingDate
            FROM 
                CUSTOMER
            LEFT JOIN 
                BOOKING ON CUSTOMER.CustomerID = BOOKING.CustomerID
            LEFT JOIN 
                TICKET ON BOOKING.BookingID = TICKET.BookingID
            LEFT JOIN 
                SEAT ON TICKET.SeatID = SEAT.SeatID
            LEFT JOIN 
                SHOWTIME ON TICKET.ShowtimeID = SHOWTIME.ShowtimeID
            LEFT JOIN 
                MOVIE ON SHOWTIME.MovieID = MOVIE.MovieID
            LEFT JOIN 
                CINEMA ON SHOWTIME.CinemaID = CINEMA.CinemaID
            WHERE 
                CUSTOMER.CustomerID = ?
            AND MOVIE.MovieID IS NOT NULL
            ORDER BY 
                BOOKING.BookingDate DESC;
        `;
        params.push(customerID);
    } else if (departmentID == '3') {
        // Query สำหรับ admin ที่ดูประวัติทั้งหมด
        sql = `
            SELECT 
                COALESCE(CUSTOMER.Username, EMPLOYEE.Name) AS BookerName,
                COALESCE(CUSTOMER.Email, EMPLOYEE.Email) AS BookerEmail,
                MOVIE.MovieID,
                MOVIE.Title,
                MOVIE.Genre,
                MOVIE.Duration,
                MOVIE.Director,
                MOVIE.Rating,
                MOVIE.ReleaseDate,
                MOVIE.Synopsis,
                CINEMA.Name AS CinemaName,
                CINEMA.Location,
                CINEMA.Capacity,
                SEAT.SeatID,
                SEAT.Status,
                TICKET.TicketID,
                TICKET.Price,
                TICKET.Qrcode,
                TICKET.SeatNumber,
                SHOWTIME.ShowtimeID,
                SHOWTIME.ShowDate,
                SHOWTIME.ShowTime,
                BOOKING.BookingID,
                BOOKING.BookingDate
            FROM 
                BOOKING
            LEFT JOIN 
                CUSTOMER ON BOOKING.CustomerID = CUSTOMER.CustomerID
            LEFT JOIN 
                EMPLOYEE ON BOOKING.EmployeeID = EMPLOYEE.EmployeeID
            LEFT JOIN 
                TICKET ON BOOKING.BookingID = TICKET.BookingID
            LEFT JOIN 
                SEAT ON TICKET.SeatID = SEAT.SeatID
            LEFT JOIN 
                SHOWTIME ON TICKET.ShowtimeID = SHOWTIME.ShowtimeID
            LEFT JOIN 
                MOVIE ON SHOWTIME.MovieID = MOVIE.MovieID
            LEFT JOIN 
                CINEMA ON SHOWTIME.CinemaID = CINEMA.CinemaID
            ORDER BY 
                BOOKING.BookingDate DESC;
        `;
    } else if (departmentID != '3' && employeeID) {
        // Query สำหรับพนักงาน
        sql = `
            SELECT 
                MOVIE.MovieID,
                MOVIE.Title,
                MOVIE.Genre,
                MOVIE.Duration,
                MOVIE.Director,
                MOVIE.Rating,
                MOVIE.ReleaseDate,
                MOVIE.Synopsis,
                CINEMA.Name AS CinemaName,
                CINEMA.Location,
                CINEMA.Capacity,
                SEAT.SeatID,
                TICKET.TicketID,
                TICKET.price,
                TICKET.Qrcode,
                TICKET.SeatNumber,
                SHOWTIME.ShowtimeID,
                SHOWTIME.Showtime,
                SHOWTIME.Showdate,
                BOOKING.BookingDate
            FROM 
                EMPLOYEE
            LEFT JOIN 
                BOOKING ON EMPLOYEE.EmployeeID = BOOKING.EmployeeID
            LEFT JOIN 
                TICKET ON BOOKING.BookingID = TICKET.BookingID
            LEFT JOIN 
                SEAT ON TICKET.SeatID = SEAT.SeatID
            LEFT JOIN 
                SHOWTIME ON TICKET.ShowtimeID = SHOWTIME.ShowtimeID
            LEFT JOIN 
                MOVIE ON SHOWTIME.MovieID = MOVIE.MovieID
            LEFT JOIN 
                CINEMA ON SHOWTIME.CinemaID = CINEMA.CinemaID
            WHERE EMPLOYEE.EmployeeID = ?
                AND MOVIE.MovieID IS NOT NULL
            ORDER BY 
                BOOKING.BookingDate DESC;
        `;
        params.push(employeeID);
    } else {
        // Query default สำหรับผู้ใช้ที่ไม่มีการระบุข้อมูล (fallback)
        sql = `
            SELECT 
                MOVIE.MovieID,
                MOVIE.Title,
                MOVIE.Genre,
                MOVIE.Duration,
                MOVIE.Director,
                MOVIE.Rating,
                MOVIE.ReleaseDate,
                MOVIE.Synopsis,
                CINEMA.Name AS CinemaName,
                CINEMA.Location,
                CINEMA.Capacity,
                SEAT.SeatID,
                TICKET.TicketID,
                TICKET.price,
                TICKET.Qrcode,
                TICKET.SeatNumber,
                SHOWTIME.ShowtimeID,
                SHOWTIME.Showtime,
                SHOWTIME.Showdate,
                BOOKING.BookingDate
            FROM 
                BOOKING
            LEFT JOIN 
                TICKET ON BOOKING.BookingID = TICKET.BookingID
            LEFT JOIN 
                SEAT ON TICKET.SeatID = SEAT.SeatID
            LEFT JOIN 
                SHOWTIME ON TICKET.ShowtimeID = SHOWTIME.ShowtimeID
            LEFT JOIN 
                MOVIE ON SHOWTIME.MovieID = MOVIE.MovieID
            LEFT JOIN 
                CINEMA ON SHOWTIME.CinemaID = CINEMA.CinemaID
            ORDER BY 
                BOOKING.BookingDate DESC;
        `;
    }

    // Execute the SQL query
    req.db.all(sql, params, (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error occurred while fetching booking history.');
        } else {
            res.render('allhistory', { data: result, user: users });
        }
    });
});


//เลือกรอบฉาย
app.get('/booking', function (req, res) {
    const users = req.session.role;
    const MovieId = req.query.MovieID;
    const sql = `
        SELECT m.*, 
               GROUP_CONCAT(st.Showtime, ', ') AS Showtimes, 
               GROUP_CONCAT(st.ShowtimeID, ', ') AS ShowtimesID, 
               Showdate,
               c.Name, 
               c.Location
        FROM movie m
        JOIN showtime st ON m.MovieID = st.MovieID
        JOIN cinema c ON st.CinemaID = c.CinemaID
        WHERE m.MovieID = ?
        GROUP BY m.MovieID, c.CinemaID;
    `;

    // Query เพื่อดึงข้อมูลหนังและรอบฉาย
    req.db.all(sql, [MovieId], (err, result) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error occurred while fetching booking data.');
        } else {
            // ส่งข้อมูลไปยัง view เพื่อแสดงผล
            console.log(result)
            res.render('booking', { data: result, user: users });
        }
    });
});

//เลือกที่นั่ง
app.get('/seat', function (req, res) {
    const users = req.session.role;
    const ShowtimesID = req.query.ShowtimesID;
    const seatSql = `
        SELECT 
            s.SeatID, 
            s.Status, 
            s.Price,
            m.MovieID,
            m.Title,
            m.Genre,
            m.Duration,
            m.Director,
            m.Rating,
            m.ReleaseDate,
            c.Name AS CinemaName,
            st.ShowtimeID,
            st.Showtime
        FROM 
            SEAT s
        JOIN 
            SHOWTIME st ON st.CinemaID = s.CinemaID AND st.ShowtimeID = ?
        JOIN 
            MOVIE m ON st.MovieID = m.MovieID
        JOIN 
            CINEMA c ON s.CinemaID = c.CinemaID 
        WHERE 
            s.CinemaID = (SELECT CinemaID FROM SHOWTIME WHERE ShowtimeID = ?)
        ORDER BY 
            s.SeatID;
    `;

    req.db.all(seatSql, [ShowtimesID, ShowtimesID], (err, seatRows) => {
        if (err) throw err;

        const ticketSql = `SELECT SeatID, SeatNumber FROM TICKET WHERE ShowtimeID = ?`;

        req.db.all(ticketSql, [ShowtimesID], (err, ticketRows) => {
            if (err) throw err;

            const bookedSeats = {};
            ticketRows.forEach(ticket => {
                const seatNumbers = ticket.SeatID.split(/,\s*|;/);
                seatNumbers.forEach(seat => {
                    bookedSeats[seat.trim()] = true;
                });
            });

            const expandedResult = seatRows.map(row => ({
                ...row,
                seat_status: bookedSeats[row.SeatID] ? 'Booked' : row.Status
            }));

            res.render('seat', { data: expandedResult, user: users, ShowtimeID: ShowtimesID });
        });
    });
});


// แสดงหน้าชำระเงิน
app.post('/payment', (req, res) => {
    const { MovieID, SelectedSeats, SelectedSeatNumbers, TotalPrice, ShowtimeID } = req.body;
    const users = req.session.role;

    // สร้าง payload สำหรับการสร้าง QR code
    const mobileNumber = '0990315095';  // หมายเลข PromptPay ของผู้รับเงิน
    const amount = parseFloat(TotalPrice);  // ใช้ราคารวมที่ผู้ใช้เลือก
    
    // สร้างข้อมูล payload ของ PromptPay พร้อมจำนวนเงิน
    const payLoad = generatePayload(mobileNumber, { amount });

    // กำหนดค่าตัวเลือกสี QR code
    const qrOptions = {
        color: {
            dark: '#000',  // สีของ QR code
            light: '#fff'  // สีพื้นหลัง
        }
    };

    // สร้าง QR code และส่งกลับไปยัง frontend
    QRCode.toDataURL(payLoad, qrOptions, (err, qrUrl) => {
        if (err) {
            console.error('Error generating QR code:', err);
            return res.status(500).send('Error occurred while generating QR code.');
        }

        // แสดงหน้า payment.ejs พร้อมข้อมูลที่จำเป็นและ QR code
        const sql = `
        SELECT s.SeatID, s.Status, s.Price,
        CASE 
            WHEN t.TicketID IS NOT NULL THEN 'Booked'
            ELSE s.Status
        END AS seat_status,
        m.MovieID,
        m.Title,
        m.Genre,
        m.Duration,
        m.Director,
        m.Rating,
        m.ReleaseDate,
        c.CinemaID,
        c.Name,
        st.ShowtimeID,
        st.Showtime,
        st.Showdate
        FROM 
            SEAT s
        LEFT JOIN 
            TICKET t ON s.SeatID = t.SeatID AND t.ShowtimeID = ?
        JOIN 
            SHOWTIME st ON st.CinemaID = s.CinemaID AND st.ShowtimeID = ?
        JOIN 
            MOVIE m ON st.MovieID = m.MovieID
        JOIN 
            CINEMA c ON s.CinemaID = c.CinemaID 
        WHERE 
            s.CinemaID = (SELECT CinemaID FROM SHOWTIME WHERE ShowtimeID = ?)
        ORDER BY 
            s.SeatID;
        `;
        req.db.all(sql, [ShowtimeID, ShowtimeID, ShowtimeID], (err, result) => {
            if (err) {
                console.error('Error:', err);
                return res.status(500).send('Error occurred while fetching seat data.');
            }
            // ส่งข้อมูลไปยังหน้า payment พร้อม QR code
            res.render('payment', { 
                data: result, 
                MovieID, 
                SelectedSeats, 
                TotalPrice, 
                SelectedSeatNumbers, 
                qrUrl,  // URL ของ QR code
                user: users 
            });
        });
    });
});



//ชำระเงิน
function generateTicketID() {
    const timestamp = Date.now(); // ใช้เวลาเป็นพื้นฐานเพื่อไม่ให้ซ้ำกัน
    return `TICKET${timestamp}`;
}

app.post('/mock-payment', async (req, res) => {
    const { SeatID, SeatNumber, showtimeID, Price, CustomerID, employeeID, Showdate, Showtime, MovieName , CinemaName} = req.body;

    // ตรวจสอบว่าเป็นลูกค้าหรือพนักงาน
    if (!CustomerID && !employeeID) {
        return res.status(400).json({ error: 'Missing CustomerID or employeeID' });
    }

    // สร้าง BookingID และวันที่จอง
    const BookingID = `BK${Date.now()}`;
    const BookingDate = new Date().toISOString(); // SQLite ต้องการรูปแบบวันที่ใน ISO string format

    try {
        if (CustomerID) {
            // ตรวจสอบว่ามี CustomerID อยู่ในตาราง customer หรือไม่
            const customerCheckSql = `SELECT CustomerID FROM customer WHERE CustomerID = ?;`;
            const customerExists = await new Promise((resolve, reject) => {
                req.db.get(customerCheckSql, [CustomerID], (err, result) => {
                    if (err) {
                        console.error('Error checking customer:', err.message);
                        return reject(new Error('Error checking customer: ' + err.message));
                    }
                    resolve(result !== undefined); // คืนค่า true ถ้าลูกค้ามีอยู่แล้ว
                });
            });

            if (!customerExists) {
                return res.status(400).json({ error: 'Customer does not exist' });
            }

            // เพิ่มการจองสำหรับลูกค้า
            const bookingSql = `INSERT INTO booking (CustomerID, BookingID, BookingDate) VALUES (?, ?, ?)`;
            await new Promise((resolve, reject) => {
                req.db.run(bookingSql, [CustomerID, BookingID, BookingDate], (err) => {
                    if (err) {
                        console.error('Error inserting booking:', err.message);
                        return reject(new Error('Error inserting booking: ' + err.message));
                    }
                    resolve();
                });
            });
        } else if (employeeID) {
            // ตรวจสอบว่ามี employeeID อยู่ในตาราง employee หรือไม่
            const employeeCheckSql = `SELECT EmployeeID FROM employee WHERE EmployeeID = ?`;
            const employeeExists = await new Promise((resolve, reject) => {
                req.db.get(employeeCheckSql, [employeeID], (err, result) => {
                    if (err) {
                        console.error('Error checking employee:', err.message);
                        return reject(new Error('Error checking employee: ' + err.message));
                    }
                    resolve(result !== undefined); // คืนค่า true ถ้าพนักงานมีอยู่แล้ว
                });
            });

            if (!employeeExists) {
                return res.status(400).json({ error: 'Employee does not exist' });
            }

            // เพิ่มการจองสำหรับพนักงาน
            const bookingSql = `INSERT INTO booking (EmployeeID, BookingID, BookingDate) VALUES (?, ?, ?)`;
            await new Promise((resolve, reject) => {
                req.db.run(bookingSql, [employeeID, BookingID, BookingDate], (err) => {
                    if (err) {
                        console.error('Error inserting booking:', err.message);
                        return reject(new Error('Error inserting booking: ' + err.message));
                    }
                    resolve();
                });
            });
        }

        // Insert ข้อมูลตั๋ว
        const TicketID = generateTicketID();
        const qrCodeData = `BookingID: ${BookingID}, MovieName: ${MovieName}, SeatNumber: ${SeatID}, CinemaName: ${CinemaName}, ShowDate: ${Showdate}, Showtime: ${Showtime}`;
        const qrCodeURL = await QRCode.toDataURL(qrCodeData);

        const ticketSql = `INSERT INTO ticket (TicketID, BookingID, SeatID, SeatNumber, showtimeID, price, QRCode) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        await new Promise((resolve, reject) => {
            req.db.run(ticketSql, [TicketID, BookingID, SeatID, SeatNumber, showtimeID, Price, qrCodeURL], (err) => {
                if (err) {
                    console.error('Error inserting ticket:', err.message);
                    return reject(new Error('Error inserting ticket: ' + err.message));
                }
                resolve();
            });
        });

        // ย้ายไปหน้าถัดไปหลังจากการจองสำเร็จ
        res.redirect('/ticket');

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ error: 'An error occurred: ' + error.message });
    }
});


//แสดงตั๋ว
app.get('/ticket', function (req, res) {
    const users = req.session.role;
    let employeeID = users ? users.employeeID : null;
    let sql;
    if (employeeID) {  // ตรวจสอบว่าผู้ใช้เป็นพนักงาน
        sql = `SELECT 
            MOVIE.MovieID,
            MOVIE.Title,
            MOVIE.Genre,
            MOVIE.Duration,
            MOVIE.Director,
            MOVIE.Rating,
            MOVIE.ReleaseDate,
            MOVIE.Synopsis,
            CINEMA.Name AS CinemaName,
            CINEMA.Location,
            CINEMA.Capacity,
            SEAT.SeatID,
            TICKET.TicketID,
            TICKET.price,
            TICKET.Qrcode,
            TICKET.SeatNumber,
            SHOWTIME.ShowtimeID,
            SHOWTIME.Showdate,
            SHOWTIME.Showtime,
            BOOKING.BookingDate,
            EMPLOYEE.Name AS EmployeeName
        FROM 
            EMPLOYEE
        JOIN 
            BOOKING ON EMPLOYEE.EmployeeID = BOOKING.EmployeeID
        JOIN 
            TICKET ON BOOKING.BookingID = TICKET.BookingID
        JOIN 
            SEAT ON TICKET.SeatID = SEAT.SeatID
        JOIN 
            SHOWTIME ON TICKET.ShowtimeID = SHOWTIME.ShowtimeID
        JOIN 
            MOVIE ON SHOWTIME.MovieID = MOVIE.MovieID
        JOIN 
            CINEMA ON SHOWTIME.CinemaID = CINEMA.CinemaID  
        WHERE 
            BOOKING.EmployeeID = ?
        ORDER BY 
            BOOKING.BookingDate DESC
        LIMIT 1;`;

        req.db.get(sql, [users.employeeID], (err, result) => {
            if (err) {
                console.error('Error fetching employee ticket data:', err);
                return res.status(500).send('Error fetching ticket data.');
            }
            res.render('ticket', { data: [result], user: users });
        });

    } else {
        // SQL Query สำหรับลูกค้า (Customer)
        sql = `SELECT 
            CUSTOMER.Username,
            MOVIE.MovieID,
            MOVIE.Title,
            MOVIE.Genre,
            MOVIE.Duration,
            MOVIE.Director,
            MOVIE.Rating,
            MOVIE.ReleaseDate,
            MOVIE.Synopsis,
            CINEMA.Name AS CinemaName,
            CINEMA.Location,
            CINEMA.Capacity,
            SEAT.SeatID,
            TICKET.TicketID,
            TICKET.price,
            TICKET.Qrcode,
            TICKET.SeatNumber,
            SHOWTIME.ShowtimeID,
            SHOWTIME.Showtime,
            SHOWTIME.Showdate,
            BOOKING.BookingDate
        FROM 
            CUSTOMER
        LEFT JOIN 
            BOOKING ON CUSTOMER.CustomerID = BOOKING.CustomerID
        LEFT JOIN 
            TICKET ON BOOKING.BookingID = TICKET.BookingID
        LEFT JOIN 
            SEAT ON TICKET.SeatID = SEAT.SeatID
        LEFT JOIN 
            SHOWTIME ON TICKET.ShowtimeID = SHOWTIME.ShowtimeID
        LEFT JOIN 
            MOVIE ON SHOWTIME.MovieID = MOVIE.MovieID
        LEFT JOIN 
            CINEMA ON SHOWTIME.CinemaID = CINEMA.CinemaID  
        WHERE 
            CUSTOMER.CustomerID = ?
        ORDER BY 
            BOOKING.BookingDate DESC
        LIMIT 1;`;

        req.db.get(sql, [users.CustomerID], (err, result) => {
            if (err) {
                console.error('Error fetching customer ticket data:', err);
                return res.status(500).send('Error fetching ticket data.');
            }
            res.render('ticket', { data: [result], user: users });
        });
    }
});

// บรรณาธิการ
/// หน้าหลักบรรณาธิการ
app.get('/main_bun', function (req, res) {
    const users = req.session.role;
    const sql = 'SELECT * FROM movie';

    req.db.all(sql, [], (err, result) => {
        if (err) {
            console.error('Error fetching movie data:', err);
            return res.status(500).send('Error fetching movie data.');
        }
        res.render('main_bun', { data: result, user: users });
    });
});

// บรรณาธิการดูรายละเอียดภาพยนตร์
app.get('/detail_bun', function (req, res) {
    const users = req.session.role;
    const MovieId = req.query.MovieId;
    const sql = 'SELECT * FROM movie WHERE MovieId = ?';

    req.db.get(sql, [MovieId], (err, result) => {
        if (err) {
            console.error('Error fetching movie details:', err);
            return res.status(500).send('Error fetching movie details.');
        }
        res.render('detail_bun', { data: [result], user: users });
    });
});

// แสดงหน้าฟอร์มเพิ่มภาพยนตร์
app.get('/add', function (req, res) {
    res.sendFile(path.join(__dirname, "/public/add.html"));
});

// เพิ่มรูปภาพและข้อมูลภาพยนตร์
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/img/'); // ระบุโฟลเดอร์ที่ต้องการจัดเก็บรูปภาพ
    },
    filename: function (req, file, cb) {
        // กำหนดชื่อไฟล์เป็นชื่อเดิมก่อน แล้วค่อยเปลี่ยนชื่อในภายหลัง
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });

app.post('/add_process', function (req, res) {
    upload.single('image')(req, res, function (err) {
        if (err) {
            return res.status(400).send("Error uploading file: " + err.message);
        }

        if (!req.body.MovieId) {
            return res.status(400).send("MovieId is required");
        }

        let formdata = {
            MovieId: req.body.MovieId,
            Title: req.body.Title,
            Genre: req.body.Genre,
            Duration: req.body.Duration,
            Director: req.body.Director,
            Rating: req.body.Rating,
            ReleaseDate: req.body.ReleaseDate,
            Synopsis: req.body.Synopsis,
            Showdate: req.body.showdate,
            Cinema1: req.body.cinema1,
            showtime1: req.body.showtime1,
            showtime2: req.body.showtime2,
        };

        console.log(formdata);

        const oldPath = `public/img/${req.file.originalname}`;
        const ext = path.extname(req.file.originalname);
        const newPath = `public/img/${req.body.MovieId}${ext}`;

        fs.rename(oldPath, newPath, function (err) {
            if (err) {
                console.error('Error renaming file:', err);
                return res.status(500).send("Error renaming file");
            }

            console.log(`File renamed to: ${newPath}`);

            req.db.get('SELECT MAX(ShowtimeID) AS maxShowtimeID FROM showtime', (err, row) => {
                if (err) {
                    console.error('Error fetching last primary key:', err);
                    return res.status(500).send("Database error");
                }

                let lastID = (row && row.maxShowtimeID) ? row.maxShowtimeID + 1 : 1;
                console.log(lastID)

                let movieSql = `INSERT INTO movie (MovieID, Title, Genre, Duration, Director, Rating, ReleaseDate, Synopsis)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

                let showtimeSql = `INSERT INTO showtime (ShowtimeID, MovieID, CinemaID, Showdate, Showtime)
                VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)`;

                req.db.run(movieSql, [formdata.MovieId, formdata.Title, formdata.Genre, formdata.Duration, formdata.Director, formdata.Rating, formdata.ReleaseDate, formdata.Synopsis], function (err) {
                    if (err) {
                        console.error('Error inserting movie:', err);
                        return res.status(500).send("Database error while inserting movie");
                    }
                    console.log("Movie record inserted");

                    req.db.run(showtimeSql, [lastID, formdata.MovieId, formdata.Cinema1, formdata.Showdate, formdata.showtime1, lastID + 1, formdata.MovieId, formdata.Cinema1, formdata.Showdate, formdata.showtime2], function (err) {
                        if (err) {
                            console.error('Error inserting showtime:', err);
                            return res.status(500).send("Database error while inserting showtime");
                        }
                        console.log("Showtime records inserted");
                        res.redirect('/main_bun');
                    });
                });
            });
        });
    });
});

//แสดงหน้าแก้ไขรายละเอียดภาพยนตร์
app.get('/fix', function (req, res) {
    const users = req.session.role;
    const MovieId = req.query.MovieId;
    const sql = `SELECT * FROM movie WHERE MovieId = ?`;

    req.db.get(sql, [MovieId], (err, result) => {
        if (err) throw err;
        res.render('fix', { data: [result], user: users });
    });
});

// แก้ไขรายละเอียดภาพยนตร์
app.post('/fix_process', function (req, res) {
    let formdata = {
        MovieId: req.body.MovieId,
        Title: req.body.Title,
        Genre: req.body.Genre,
        Duration: req.body.Duration,
        Director: req.body.Director,
        Rating: req.body.Rating,
        ReleaseDate: req.body.ReleaseDate,
        Synopsis: req.body.Synopsis
    };

    console.log("Initial form data:", formdata);

    let updates = [];
    let params = []; // เริ่มต้นอาร์เรย์พารามิเตอร์

    // ตรวจสอบว่าแต่ละฟิลด์มีข้อมูลหรือไม่
    if (formdata.Title) {
        updates.push(`Title = ?`);
        params.push(formdata.Title); // เพิ่มค่าไปยังพารามิเตอร์
    }
    if (formdata.Genre) {
        updates.push(`Genre = ?`);
        params.push(formdata.Genre);
    }
    if (formdata.Duration) {
        updates.push(`Duration = ?`);
        params.push(formdata.Duration);
    }
    if (formdata.Director) {
        updates.push(`Director = ?`);
        params.push(formdata.Director);
    }
    if (formdata.Rating) {
        updates.push(`Rating = ?`);
        params.push(formdata.Rating);
    }
    if (formdata.ReleaseDate) {
        updates.push(`ReleaseDate = ?`);
        params.push(formdata.ReleaseDate);
    }
    if (formdata.Synopsis) {
        updates.push(`Synopsis = ?`);
        params.push(formdata.Synopsis);
    }

    // ถ้ามีการอัปเดต
    if (updates.length > 0) {
        let sql = `UPDATE movie SET ${updates.join(', ')} WHERE MovieId = ?`;
        params.push(formdata.MovieId); // เพิ่ม MovieId เป็นพารามิเตอร์สุดท้าย

        req.db.run(sql, params, function (err) {
            if (err) {
                console.error("Error updating movie details:", err);
                return res.status(500).send("Error updating movie details");
            }
            console.log("Movie details updated successfully");
            res.redirect('/main_bun');
        });
    } else {
        console.log("No updates made, redirecting...");
        res.redirect('/detail_bun');
    }
});

// ลบภาพยนตร์
//ลบรูป
function deleteImage(imageName) {
    // สร้างเส้นทางของไฟล์ที่จะลบ
    const filePath = path.join(__dirname, 'public', 'img', `${imageName}.jpg`);

    // ลบไฟล์
    fs.unlink(filePath, (err) => {
        if (err) {
            console.error("Error deleting file:", err);
            return;
        }
        console.log("File deleted successfully!");
    });
}
//ลบข้อมูล
app.get('/delete_process', function (req, res) {
    let formdata = {
        MovieId: req.query.MovieId,
    };
    let sql = `DELETE FROM movie WHERE MovieId = ?`;
    req.db.run(sql, [formdata.MovieId], function (err) {
        if (err) throw err;
        deleteImage(formdata.MovieId);
        console.log("Movie record deleted");
        res.redirect('/main_bun');
    });
});

//พนักงานตรวจตั๋วภาพยนตร์
app.get("/check", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "check.html"));
  });
  
  // การเชื่อมต่อ Socket.IO
  io.on("connection", (socket) => {
    console.log("พนักงาน connected");
  
    socket.on("checkTicket", (qrCodeData) => {
      // แยกข้อมูลจาก QR code
      const parsedData = qrCodeData.split(",").map((item) => item.trim());
      
      // สร้างตัวแปรเพื่อเก็บข้อมูลที่แยกออกมา
      let bookingId, movieName, seatNumbers, cinemaName, showDate, showTime;
  
      // ดึงค่าจากข้อมูล QR code
      parsedData.forEach(data => {
          if (data.startsWith("BookingID:")) {
              bookingId = data.split(": ")[1];
          } else if (data.startsWith("MovieName:")) {
              movieName = data.split(": ")[1];
          } else if (data.startsWith("SeatNumber:")) {
              seatNumbers = data.split(": ")[1];
          } else if (data.startsWith("CinemaName:")) {
              cinemaName = data.split(": ")[1];
          } else if (data.startsWith("ShowDate:")) {
              showDate = data.split(": ")[1];
          } else if (data.startsWith("Showtime:")) {
              showTime = data.split(": ")[1];
          }
      });
      // ค้นหาตั๋วในฐานข้อมูลโดยใช้ BookingID
      db.get("SELECT * FROM ticket WHERE BookingID = ?;", [bookingId], (err, row) => {
        if (err) {
          console.error("Error fetching ticket:", err.message);
          return;
        }
        if (row) {
          // แสดงผลลัพธ์ที่ดึงจากฐานข้อมูล
          socket.emit("ticketValid", `ตรวจตั๋วสำเร็จ ที่นั่ง: ${seatNumbers}, ภาพยนตร์: ${movieName}, 
            โรง: ${cinemaName}, ${showDate}, เวลา: ${showTime}`);
        } else {
          socket.emit("ticketInvalid", "ตั๋วไม่ถูกต้อง");
        }
      });
  });
  
    socket.on("disconnect", () => {
      console.log("พนักงาน disconnected");
    });
  });

// Starting the server
server.listen(port, () => {
    console.log("Server started.");
});