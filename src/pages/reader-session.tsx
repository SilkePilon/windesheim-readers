import { Navigate, useParams } from "react-router";

/** `/reader/:id/session`: placeholder until the session player lands (Task 10); back to the reader page. */
export default function ReaderSessionPage() {
  const { id = "" } = useParams();
  return <Navigate to={`/reader/${id}`} replace />;
}
