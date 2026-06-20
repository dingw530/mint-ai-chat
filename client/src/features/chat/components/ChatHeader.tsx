import ModelSwitcher from '@/shared/components/ModelSwitcher';
import type { EndpointOutput } from '@/types';

interface ChatHeaderProps {
  title: string;
  activeEndpoint: EndpointOutput | null;
  endpoints: EndpointOutput[];
  onEndpointChange: () => Promise<void>;
}

export default function ChatHeader({
  title,
  activeEndpoint,
  endpoints,
  onEndpointChange,
}: ChatHeaderProps) {
  return (
    <div className="main-header">
      <h2>{title}</h2>
      <div className="main-header-right">
        <ModelSwitcher
          activeEndpoint={activeEndpoint}
          endpoints={endpoints}
          onEndpointChange={onEndpointChange}
        />
      </div>
    </div>
  );
}
