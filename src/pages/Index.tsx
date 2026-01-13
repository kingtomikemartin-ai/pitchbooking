import { useUser } from '@/lib/userContext';
import { LoginForm } from '@/components/LoginForm';
import { Header } from '@/components/Header';
import { FootballBookingExperience } from '@/components/FootballBookingExperience';

const Index = () => {
  const { isLoggedIn } = useUser();

  if (!isLoggedIn) {
    return <LoginForm />;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <FootballBookingExperience />
    </div>
  );
};

export default Index;
