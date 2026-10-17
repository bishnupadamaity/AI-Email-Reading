import { Compass } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { PageBody } from '../../components/layout/AppShell';
import { TopbarLead } from '../../components/layout/PageChrome';
import { ButtonLink } from '../../components/ui/Button';
import { Panel } from '../../components/ui/Panel';
import { EmptyState } from '../../components/ui/states';
import { routes } from '../../lib/navigation';

export function NotFoundPage() {
  const { pathname } = useLocation();

  return (
    <PageBody>
      <TopbarLead title="Page not found" />
      <Panel>
        <EmptyState
          icon={<Compass size={18} aria-hidden="true" />}
          title="No such page"
          body={
            <>
              Nothing is routed at <code className="inline-code">{pathname}</code>.
            </>
          }
          actions={
            <>
              <ButtonLink to={routes.overview} variant="primary">
                Go to overview
              </ButtonLink>
              <ButtonLink to={routes.inbox}>Open the inbox</ButtonLink>
            </>
          }
        />
      </Panel>
    </PageBody>
  );
}
