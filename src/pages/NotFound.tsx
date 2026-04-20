import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/layout/PageState";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <PageState
      title="404"
      message="Página não encontrada"
      details="A rota que você tentou acessar não existe ou foi movida."
      action={
        <Link to="/">
          <Button className="w-full">Voltar para início</Button>
        </Link>
      }
    />
  );
};

export default NotFound;
