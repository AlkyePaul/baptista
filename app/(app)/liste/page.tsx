import { redirect } from "next/navigation";

/** "Liste" was merged into the Aggiungi module (D21). */
export default function ListsRedirect() {
  redirect("/aggiungi?tipo=lista");
}
