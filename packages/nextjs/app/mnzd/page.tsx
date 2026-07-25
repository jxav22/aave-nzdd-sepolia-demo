import { redirect } from "next/navigation";

/** The market panel moved to /advanced when the consumer surface at /app was built. */
const MnzdRedirect = () => {
  redirect("/advanced");
};

export default MnzdRedirect;
