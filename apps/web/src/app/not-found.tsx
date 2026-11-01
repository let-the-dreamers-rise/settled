import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card">
      <p>That page does not exist.</p>
      <Link className="btn secondary" href="/">Back to the start</Link>
    </div>
  );
}
