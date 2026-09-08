import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { Pet } from '../api/types';
import { useResource } from '../app/hooks';
import { useAction } from '../app/hooks';
import { useSession } from '../app/session';
import { PetForm, petToValues, valuesToPayload } from '../components/PetForm';
import { formatAge, initials } from '../lib/format';
import { Badge, Button, Card, Empty, Sheet } from '../ui/primitives';

export function PetAvatar({ pet, size = 48 }: { pet: Pet; size?: number }): ReactNode {
  if (pet.avatarFileId) {
    return (
      <img
        src={`/api/v1/files/${pet.avatarFileId}/thumb`}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full bg-brand-soft font-semibold text-brand"
      style={{ width: size, height: size, fontSize: size / 2.4 }}
    >
      {initials(pet.name)}
    </span>
  );
}

export function PetsPage(): ReactNode {
  const { t, locale, canWrite } = useSession();
  const pets = useResource<{ pets: Pet[] }>('/pets');
  const [adding, setAdding] = useState(false);

  const create = useAction(async (payload: Record<string, unknown>) => {
    await api.post('/pets', payload);
    setAdding(false);
    pets.reload();
  });

  return (
    <>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('nav.pets')}</h1>
        {canWrite && <Button onClick={() => setAdding(true)}>{t('action.add')}</Button>}
      </header>

      {pets.loading && <p className="text-muted">{t('state.loading')}</p>}
      {!pets.loading && (pets.data?.pets.length ?? 0) === 0 && <Empty>{t('state.empty')}</Empty>}

      <ul className="space-y-3">
        {pets.data?.pets.map((pet) => (
          <li key={pet.id}>
            <Link to={`/pets/${pet.id}`} className="block">
              <Card className="flex items-center gap-3 transition hover:border-brand/50">
                <PetAvatar pet={pet} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{pet.name}</p>
                  <p className="truncate text-sm text-muted">
                    {pet.age ? formatAge(pet.age, locale) : t('pet.ageUnknown')}
                    {pet.breed ? ` · ${pet.breed}` : ''}
                  </p>
                </div>
                {/* Allergies and chronic conditions are the one thing shown unasked. */}
                {pet.flags.length > 0 && <Badge tone="alarm">{pet.flags.length}</Badge>}
                {pet.archivedAt && <Badge>{t('pet.archived')}</Badge>}
              </Card>
            </Link>
          </li>
        ))}
      </ul>

      <Sheet title={t('pet.new')} open={adding} onClose={() => setAdding(false)}>
        <PetForm
          initial={petToValues(null)}
          error={create.error}
          pending={create.pending}
          onCancel={() => setAdding(false)}
          onSubmit={(values) => void create.run(valuesToPayload(values))}
        />
      </Sheet>
    </>
  );
}
