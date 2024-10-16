const authService = require("../service/userService");
const passport = require("../service/authGoogle");
const passportFacebook = require("../service/authFacebook");
const jwt = require("jsonwebtoken");
const cloudinary = require("../config/cloudinaryConfig");
const register = async (req, res) => {
  const { email, password, fullName, phone, role, address } = req.body;

  if (!email || !password || !fullName || !phone || !role) {
    return res
      .status(400)
      .json({ message: "You need fill full information when you register" });
  }

  try {
    const user = await authService.registerUser({
      email,
      password,
      role,
      phone,
      fullName,
      address,
    });
    res.status(201).json(user);
  } catch (error) {
    console.error("Error during user registration:", error);
    res.status(400).json({ message: error.message });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await authService.loginUser(email, password);

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.SECRET_KEY
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    });

    res.json(user);
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

const refreshToken = async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token is required" });
  }

  try {
    const newAccessToken = await authService.refreshUserToken(refreshToken);
    res.json(newAccessToken);
  } catch (error) {
    res.status(401).json({ message: error.message });
  }
};

const blockUser = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await userService.blockUser(id);
    res.status(200).json({ message: "User has been blocked", user });
  } catch (error) {
    if (error.message === "User not found") {
      res.status(404).json({ message: "User not found" });
    } else {
      res.status(500).json({ message: "Server error" });
    }
  }
};

const facebookAuth = (req, res, next) => {
  passport.authenticate("facebook", {
    scope: ["email"],
    state: req.query.state,
  })(req, res, next);
};

const googleAuth = (req, res, next) => {
  const role = req.query.state;
  passport.authenticate("google", {
    scope: ["email", "profile"],
    state: role,
  })(req, res, next);
};

const googleAuthCallback = (req, res, next) => {
  passport.authenticate("google", async (err, user, info) => {
    if (err) {
      return res.redirect(
        "http://localhost:3006/error?message=" + encodeURIComponent(err.message)
      );
    }
    if (!user) {
      return res.redirect(
        "http://localhost:3006/error?message=Authentication Failed"
      );
    }
    req.logIn(user, async (err) => {
      if (err) {
        return res.redirect(
          "http://localhost:3006/error?message=" +
            encodeURIComponent(err.message)
        );
      }

      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: "1h",
      });

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });

      const role = req.query.state;

      res.redirect(`http://localhost:3006/?token=${token}`);
    });
  })(req, res, next);
};

const facebookAuthCallback = (req, res, next) => {
  passport.authenticate("facebook", (err, user, info) => {
    if (err) {
      return res.redirect(`/error?message=${encodeURIComponent(err.message)}`);
    }
    if (!user) {
      return res.redirect(`/error?message=Authentication Failed`);
    }
    req.logIn(user, (err) => {
      if (err) {
        return res.redirect(
          `/error?message=${encodeURIComponent(err.message)}`
        );
      }

      const token = jwt.sign(
        { id: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 1000 * 60 * 60 * 24 * 7,
      });

      res.redirect(`http://localhost:3006/?token=${token}`);
    });
  })(req, res, next);
};

const ensureAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect("/login");
};

const getAllUsers = async (req, res) => {
  try {
    const users = await authService.getAllUsers();
    res.status(200).json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getUserById = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await authService.getUserById(id);
    res.status(200).json(user);
  } catch (error) {
    if (error.message === "User not found") {
      res.status(404).json({ message: "User not found" });
    } else {
      res.status(500).json({ message: error.message });
    }
  }
};

const updateUserController = async (req, res) => {
  const { id } = req.params;
  const { email, password, phone, fullName, address, avatar } = req.body;
  const avatarFile = req.file;

  try {
    let avatarUrl = avatar;

    if (avatarFile) {
      try {
        const uploadPromise = new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream({ folder: "avatars" }, (error, result) => {
              if (error) {
                return reject(new Error(error.message));
              }
              resolve(result.secure_url);
            })
            .end(avatarFile.buffer);
        });

        avatarUrl = await uploadPromise;
      } catch (uploadError) {
        console.error("Error uploading to Cloudinary:", uploadError);
        return res.status(500).json({ message: "Failed to upload avatar" });
      }
    }
    const updatedUser = await authService.updateUser(id, {
      email,
      password,
      phone,
      fullName,
      address,
      avatar: avatarUrl,
    });

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User has been updated", updatedUser });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ message: "An error occurred" });
  }
};

const changePasswordUser = async (req, res) => {
  try {
    const userId = req.user.id;
    const { oldPassword, newPassword } = req.body;
    const result = await authService.changePassword(
      userId,
      oldPassword,
      newPassword
    );

    if (result.success) {
      return res.status(200).json({ message: "User has been updated" });
    } else {
      return res.status(401).json({ message: result.message });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "An error occurred" });
  }
};

const getUserByRoleController = async (req, res) => {
  const { role } = req.params;

  try {
    const users = await authService.getUserByRole(role);
    res.status(200).json(users);
  } catch (error) {
    console.error("Error getting users by role:", error);
    res.status(500).json({ message: "An error occurred" });
  }
};

const searchUsersController = async (req, res) => {
  const { email } = req.query;
  try {
    const users = await authService.searchUser(email);
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "An error occurred" });
  }
};

module.exports = {
  searchUsersController,
  facebookAuth,
  facebookAuthCallback,
  getUserById,
  getAllUsers,
  register,
  login,
  refreshToken,
  googleAuth,
  googleAuthCallback,
  blockUser,
  ensureAuthenticated,
  updateUserController,
  changePasswordUser,
  getUserByRoleController,
};
