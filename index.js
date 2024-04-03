const express = require("express");
const app = express();
const mysql = require("mysql2");
const cors = require("cors");
const bcrypt = require("bcrypt");
const saltRounds = 10;
const jwt = require("jsonwebtoken");
const multer = require("multer");
const Path2D = require("path");
const jwtBlacklist = [];
const cookieParser = require("cookie-parser");
const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

require("dotenv").config();

app.use(cookieParser());
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const jwttoken = "secret";

const db = mysql.createConnection(process.env.DATABASE_URL);

// GET route to fetch UserAccount data
app.get("/UserAccount", (req, res) => {
  db.query("SELECT * FROM UserAccount", (err, result) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.send(result);
    }
  });
});

// GET route to fetch UserAccount data
app.get("/Storage", (req, res) => {
  db.query("SELECT * FROM Storage", (err, result) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.send(result);
    }
  });
});

app.get("/Product", (req, res) => {
  db.query(
    "SELECT p.*, COUNT(s.Serial_No) AS Quantity FROM Product p LEFT JOIN SerialNumber s ON p.P_ID = s.P_ID GROUP BY p.P_ID",
    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "Internal server error" });
      } else {
        result.forEach((product) => {
          db.query(
            "UPDATE Product SET Quantity = ? WHERE P_ID = ?",
            [product.Quantity, product.P_ID],
            (updateErr, updateResult) => {
              if (updateErr) {
                console.log(updateErr);
              }
            }
          );
        });

        res.send(result);
      }
    }
  );
});

app.get("/SerialNumber", (req, res) => {
  db.query(
    "SELECT SerialNumber.*, Product.P_Name, Product.image, Storage.Location FROM SerialNumber INNER JOIN Product ON SerialNumber.P_ID = Product.P_ID LEFT OUTER JOIN Storage ON SerialNumber.S_ID = Storage.S_ID",

    (err, result) => {
      if (err) {
        console.log(err);
        res.status(500).json({ error: "Internal server error" });
      } else {
        res.send(result);
      }
    }
  );
});

// GET route to fetch Product
app.get("/Order", (req, res) => {
  db.query("SELECT * FROM `Order`", (err, result) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.send(result);
    }
  });
});

// GET route to fetch UserAccount data by ID
app.get("/UserAccount", (req, res) => {
  const UserAccountId = req.params.id;
  db.query("SELECT * FROM UserAccount ", [UserAccountId], (err, result) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "Internal server error" });
    } else {
      if (result.length === 0) {
        res.status(404).json({ error: "UserAccount not found" });
      } else {
        res.send(result[0]);
      }
    }
  });
});

// POST route to create a new UserAccount
app.post("/createUserAccount", (req, res) => {
  const { username, password, position } = req.body;

  bcrypt.hash(password, saltRounds, function (err, hash) {
    if (err) {
      console.error("Error hashing password:", err);
      return res.status(500).send("Error creating user account");
    }

    console.log("Received request to create UserAccount:", {
      username,
      password: hash,
      position,
    });

    db.query(
      "INSERT INTO UserAccount (username, password, Position) VALUES (?, ?, ?)",
      [username, hash, position],
      (err, result) => {
        if (err) {
          console.log(err);
          return res.status(500).json({ error: "Internal server error" });
        } else {
          return res
            .status(200)
            .json({ message: "UserAccount created successfully" });
        }
      }
    );
  });
});

app.post("/createSerial", (req, res) => {
  const { Serial_No, P_ID, S_ID, LastUpdated } = req.body;

  // Check if Serial_No is missing or null
  if (!Serial_No) {
    return res.status(400).json({ error: "Serial_No is required" });
  }

  // Proceed with the database query
  db.query(
    "INSERT INTO SerialNumber (Serial_No, P_ID, S_ID, LastUpdated) VALUES (?, ?, ?, ?)",
    [Serial_No, P_ID, S_ID, LastUpdated],
    (err, result) => {
      if (err) {
        console.error(err);
        return res
          .status(500)
          .json({ error: "Failed to create serial number" });
      } else {
        return res
          .status(200)
          .json({ message: "SerialNumber created successfully" });
      }
    }
  );
});

// POST /login route to handle user login
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "Username and password are required" });
  }

  db.query(
    "SELECT * FROM UserAccount WHERE username = ?",
    [username],
    (err, results) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal server error" });
      }

      if (results.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const user = results[0];

      // Log user details for debugging
      console.log("User retrieved from database:", user);

      bcrypt.compare(password, user.password, (err, isLogin) => {
        if (err) {
          return res.status(500).json({ error: "Internal server error" });
        }
        if (isLogin) {
          // Log successful login for debugging
          console.log("Login successful");

          // Generate JWT token with user data and set expiration to 1 hour from now
          const token = jwt.sign(
            { username: user.username, position: user.Position },
            jwttoken,
            {
              expiresIn: "1h",
            }
          );

          // Set JWT token as a cookie in the response
          res.cookie("jwt", token, { httpOnly: true });

          // Send response with token and user position
          return res
            .status(200)
            .json({ status: "ok", position: user.Position, token });
        } else {
          // Log failed login attempts for debugging
          console.log("Login failed");
          return res
            .status(401)
            .json({ status: "error", message: "Login Failed" });
        }
      });
    }
  );
});

app.post("/Authen", (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("No token found in the request");
      return res.status(401).json({ status: "error", message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    console.log("Received token on server:", token);

    // Verify JWT token
    jwt.verify(token, jwttoken, (err, decoded) => {
      if (err) {
        console.error("Error verifying token:", err);
        return res
          .status(401)
          .json({ status: "error", message: "Token verification failed" });
      }
      console.log("Decoded token:", decoded);
      res.json({ status: "ok", decoded });
    });
  } catch (error) {
    console.error("Error handling request:", error);
    res.status(500).json({ status: "error", message: "Internal server error" });
  }
});

app.post("/logout", (req, res) => {
  const token =
    req.headers.authorization && req.headers.authorization.split(" ")[1]; // Extract token from Authorization header

  if (!token) {
    return res.status(401).json({ message: "Token not provided" });
  }

  // Blacklist the token by adding it to the jwtBlacklist array
  jwtBlacklist.push(token);

  // Clear the cookie on the client-side
  res.clearCookie("jwt");

  res.sendStatus(200);
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "public/images");
  },
  filename: (req, file, cb) => {
    cb(
      null,
      file.fieldname + "_" + Date.now() + Path2D.extname(file.originalname)
    );
  },
});

const upload = multer({ storage: storage });

// POST route to create a new Product
app.post("/createProduct", upload.single("image"), (req, res) => {
  const { P_ID, Quantity, P_Name } = req.body;
  const image = req.file; // File object from multer

  if (!image) {
    return res.status(400).json({ error: "Image file is required" });
  }

  const params = {
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: `images/${image.originalname}`, // Set the key (path) where the file will be stored in S3
    Body: image.buffer, // Set the file content
    ACL: "public-read", // Set ACL to make the uploaded file publicly accessible
  };

  // Upload the image to S3
  s3.upload(params, (err, data) => {
    if (err) {
      console.error("Error uploading image to S3:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    console.log("Image uploaded to S3 successfully:", data.Location);

    // Now you can save the product details along with the S3 image URL to your database
    const sql =
      "INSERT INTO Product (P_ID, Quantity, P_Name, image) VALUES (?, ?, ?, ?)";
    db.query(sql, [P_ID, Quantity, P_Name, data.Location], (dbErr, result) => {
      if (dbErr) {
        console.error("Error inserting product:", dbErr);
        return res.status(500).json({ error: "Internal server error" });
      }
      console.log("Product created successfully");
      res.status(200).json({ message: "Product created successfully" });
    });
  });
});

app.put("/updateUserAccount", (req, res) => {
  const { username, password, position, id } = req.body;

  let updateQuery = "UPDATE UserAccount SET ";
  let params = [];

  if (username !== undefined) {
    updateQuery += "username = ?, ";
    params.push(username);
  }

  if (password !== undefined) {
    updateQuery += "password = ?, ";
    params.push(password);
  }

  if (position !== undefined) {
    updateQuery += "position = ?, ";
    params.push(position);
  }
  // Remove the last comma and space from the query string
  updateQuery = updateQuery.slice(0, -2);

  // Add the WHERE clause to specify the UserAccount ID
  updateQuery += " WHERE id = ?";

  // Add the UserAccount ID parameter
  params.push(id);

  // Execute the update query
  db.query(updateQuery, params, (err, result) => {
    if (err) {
      console.error("Error updating UserAccount:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    // Send success response if the update was successful
    res.status(200).json({ message: "UserAccount updated successfully" });
  });
});

// PUT route to update a Product
app.put("/updateProduct", upload.single("image"), (req, res) => {
  const { P_ID, P_Name, Quantity } = req.body;
  const image = req.file ? req.file.filename : null;

  let updateQuery = "UPDATE Product SET ";
  let params = [];

  if (P_Name !== undefined) {
    updateQuery += "P_Name = ?, ";
    params.push(P_Name);
  }

  if (Quantity !== undefined) {
    updateQuery += "Quantity = ?, ";
    params.push(Quantity);
  }

  if (image !== null) {
    updateQuery += "image = ?, ";
    params.push(image);
  }

  updateQuery = updateQuery.slice(0, -2);

  updateQuery += " WHERE P_ID = ?";

  params.push(P_ID);

  db.query(updateQuery, params, (err, result) => {
    if (err) {
      console.error("Error updating product:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    res.status(200).json({ message: "Product updated successfully" });
  });
});

// PUT route to update an Order
app.put("/updateOrder", (req, res) => {
  const { OrderID, Order_date, Empno, Total_Quantity, Status } = req.body;

  let updateQuery = "UPDATE `Order` SET ";
  let params = [];

  if (Order_date !== undefined) {
    updateQuery += "Order_date = ?, ";
    params.push(Order_date);
  }

  if (Empno !== undefined) {
    updateQuery += "Empno = ?, ";
    params.push(Empno);
  }
  if (Total_Quantity !== undefined) {
    updateQuery += "Total_Quantity = ?, ";
    params.push(Status);
  }
  if (Status !== undefined) {
    updateQuery += "Status = ?, ";
    params.push(Status);
  }
  updateQuery = updateQuery.slice(0, -2);

  updateQuery += " WHERE OrderID = ?";

  params.push(OrderID);

  // Execute the update query
  db.query(updateQuery, params, (err, result) => {
    if (err) {
      console.error("Error updating order:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    // Send success response if the update was successful
    res.status(200).json({ message: "Order updated successfully" });
  });
});

app.put("/updateSerialNumber", (req, res) => {
  const { Serial_No, P_ID, S_ID, LastUpdated } = req.body;

  console.log("Received Data:", req.body);

  let updateQuery = "UPDATE SerialNumber SET ";
  let params = [];

  if (Serial_No !== undefined) {
    updateQuery += "Serial_No = ?, ";
    params.push(Serial_No);
  }

  if (P_ID !== undefined) {
    updateQuery += "P_ID = ?, ";
    params.push(P_ID);
  }

  if (S_ID !== undefined) {
    updateQuery += "S_ID = ?, ";
    params.push(S_ID);
  }
  if (LastUpdated !== undefined) {
    updateQuery += "LastUpdated = ?, ";
    params.push(LastUpdated);
  }

  // Remove the last comma and space from the query string
  updateQuery = updateQuery.slice(0, -2);

  // Add the WHERE clause to specify the UserAccount ID
  updateQuery += " WHERE Serial_No = ?";

  // Add the UserAccount ID parameter
  params.push(Serial_No);

  // Execute the update query
  db.query(updateQuery, params, (err, result) => {
    if (err) {
      console.error("Error updating SerialNumber:", err);
      return res.status(500).json({ error: "Internal server error" });
    }

    // Send success response if the update was successful
    res.status(200).json({ message: "SerialNumber updated successfully" });
  });
});

// DELETE route to delete an UserAccount by ID
app.delete("/deleteUser/:id", (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM UserAccount WHERE id = ?", id, (err, result) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "Internal server error" });
    } else {
      console.log(result);
      res.status(200).json({ message: "UserAccount deleted successfully" });
    }
  });
});

// DELETE route to delete an Product by ID
app.delete("/deleteProduct/:P_ID", (req, res) => {
  const P_ID = req.params.P_ID;
  db.query("DELETE FROM Product WHERE P_ID = ?", P_ID, (err, result) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "Internal server error" });
    } else {
      console.log(result);
      res.status(200).json({ message: "UserAccount deleted successfully" });
    }
  });
});
// DELETE route to delete an Order by ID
app.delete("/deleteOrder/:OrderID", (req, res) => {
  const OrderID = req.params.OrderID;
  db.query("DELETE FROM `Order` WHERE OrderID = ?", OrderID, (err, result) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "Internal server error" });
    } else {
      console.log(result);
      res.status(200).json({ message: " Order deleted successfully" });
    }
  });
});

// DELETE route to delete an Item by Serial_No
app.delete("/deleteItem/:Serial_No", (req, res) => {
  const Serial_No = req.params.Serial_No;
  console.log("Serial_No received:", Serial_No); // Log the Serial_No value

  // Rest of your code to delete the item
  db.query(
    "DELETE FROM SerialNumber WHERE Serial_No = ?",
    Serial_No,
    (err, result) => {
      if (err) {
        console.error("Error deleting item:", err);
        res.status(500).json({ error: "Internal server error" });
      } else {
        console.log("Item deleted successfully:", result);
        res.status(200).json({ message: "Item deleted successfully" });
      }
    }
  );
});

// Define a route for the root endpoint
app.get("/", (req, res) => {
  res.send("Welcome to the Mango Storage System!");
});

const PORT = 3001;
app.listen(process.env.PORT || PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
