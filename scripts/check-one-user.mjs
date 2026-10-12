import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();

const uri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/gurukulAI";
const email = (process.argv[2] || "rahul.maurya@codingexpo.in").toLowerCase();

const main = async () => {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const user = await db.collection("users").findOne({ email });
  if (!user) {
    console.log("USER_NOT_FOUND", email);
    await mongoose.disconnect();
    return;
  }
  const role = user.roleId
    ? await db.collection("roles").findOne({ _id: user.roleId })
    : null;
  console.log({
    email: user.email,
    status: user.status,
    hasPassword: Boolean(user.password),
    passwordIsBcrypt: String(user.password || "").startsWith("$2"),
    roleId: String(user.roleId || ""),
    roleName: role?.name || "ROLE_MISSING",
    schoolId: String(user.schoolId || ""),
  });
  await mongoose.disconnect();
};

main().catch(async (e) => {
  console.error(e);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
