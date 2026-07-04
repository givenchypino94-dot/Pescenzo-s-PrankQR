import CreatorDashboard from "./components/CreatorDashboard";
import PrankVictimView from "./components/PrankVictimView";

export default function App() {
  const path = window.location.pathname;
  const prankMatch = path.match(/^\/p\/([a-zA-Z0-9_-]+)/);

  if (prankMatch) {
    const prankId = prankMatch[1];
    return <PrankVictimView prankId={prankId} />;
  }

  return <CreatorDashboard />;
}

