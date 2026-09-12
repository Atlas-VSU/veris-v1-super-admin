import Dither from "@/components/ui/Dither";
import { LoginCard } from "@/features/auth/homepage/components/LoginCard";

export function HomePageLayout() {
  return (
    <div
      className="relative flex min-h-svh h-svh w-full items-center justify-center overflow-hidden p-6 sm:p-10">
      {/* Background Dither */}
      <Dither
        waveColor={[0.1450980392156863, 0.38823529411764707, 0.9215686274509803]}
        disableAnimation={false}
        enableMouseInteraction
        mouseRadius={0.1}
        colorNum={5.4}
        waveAmplitude={0.3}
        waveFrequency={1.7}
        waveSpeed={0.05}
        backgroundColor={[1, 1, 1]}
      />
      <LoginCard />
    </div>
  );
}
