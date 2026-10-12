import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gurukulAI";

const main = async () => {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  console.log("Connected:", uri);

  const users = db.collection("users");
  const total = await users.countDocuments();
  const missingPwd = await users.countDocuments({
    $or: [{ password: { $exists: false } }, { password: null }, { password: "" }],
  });
  const withPwd = total - missingPwd;

  console.log("users total:", total);
  console.log("users with password:", withPwd);
  console.log("users missing/empty password:", missingPwd);

  const sampleEmails = await users
    .find({}, { projection: { email: 1, status: 1, roleId: 1 } })
    .limit(15)
    .toArray();
  console.log("sample emails:");
  for (const u of sampleEmails) {
    console.log("-", u.email || "(no email)", "| status:", u.status, "| roleId:", u.roleId ? "yes" : "NO");
  }

  const roles = await db.collection("roles").countDocuments();
  console.log("roles:", roles);

  const checkEmails = [
    "rahul.maurya@codingexpo.in",
    "admin@gurukul.ai",
    "rmgadmin@gmail.com",
    "rgm@principal.com",
  ];
  for (const email of checkEmails) {
    const u = await users.findOne(
      { email: email.toLowerCase() },
      { projection: { email: 1, status: 1, password: 1, roleId: 1 } },
    );
    console.log(
      `lookup ${email}:`,
      u
        ? `FOUND status=${u.status} hasPassword=${Boolean(u.password)} pwdLooksHashed=${typeof u.password === "string" && u.password.startsWith("$2")}`
        : "NOT FOUND",
    );
  }

  await mongoose.disconnect();
};

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
