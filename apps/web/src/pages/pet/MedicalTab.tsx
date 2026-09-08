import { type ReactNode, useState } from 'react';
import { api } from '../../api/client';
import type {
  HealthFlag,
  MedicationCourse,
  ParasiteTreatment,
  Pet,
  Vaccination,
  VaccineOption,
  Visit,
} from '../../api/types';
import { useAction, useResource, useToday } from '../../app/hooks';
import { useSession, useUser } from '../../app/session';
import { formatDate } from '../../lib/format';
import type { MessageKey } from '../../lib/i18n';
import {
  Badge,
  Button,
  Card,
  Empty,
  Field,
  Input,
  Select,
  SectionTitle,
  Sheet,
  TextArea,
} from '../../ui/primitives';

function useReload(...resources: { reload: () => void }[]) {
  return () => resources.forEach((resource) => resource.reload());
}

export function MedicalTab({ pet, onChanged }: { pet: Pet; onChanged: () => void }): ReactNode {
  const { t, locale, canWrite } = useSession();
  const today = useToday(useUser().timeZone);

  const vaccinations = useResource<{ vaccinations: Vaccination[] }>(`/pets/${pet.id}/vaccinations`);
  const parasites = useResource<{ treatments: ParasiteTreatment[] }>(
    `/pets/${pet.id}/parasite-treatments`,
  );
  const visits = useResource<{ visits: Visit[] }>(`/pets/${pet.id}/visits`);
  const medications = useResource<{ medications: MedicationCourse[] }>(
    `/pets/${pet.id}/medications`,
  );
  const catalogue = useResource<{ vaccines: VaccineOption[] }>(`/pets/${pet.id}/vaccine-catalogue`);

  const reloadAll = useReload(vaccinations, parasites, visits, medications);
  const [sheet, setSheet] = useState<
    null | 'vaccination' | 'parasite' | 'visit' | 'flag' | 'medication'
  >(null);

  const close = () => setSheet(null);

  return (
    <div className="space-y-6">
      <p className="rounded-xl border border-line bg-surface px-3 py-2 text-xs text-muted">
        {t('medical.notAdvice')}
      </p>

      <section>
        <SectionTitle
          action={
            canWrite && (
              <Button tone="quiet" onClick={() => setSheet('vaccination')}>
                {t('action.add')}
              </Button>
            )
          }
        >
          {t('medical.vaccinations')}
        </SectionTitle>
        <Card>
          {(vaccinations.data?.vaccinations.length ?? 0) === 0 ? (
            <Empty>{t('state.empty')}</Empty>
          ) : (
            <ul>
              {vaccinations.data?.vaccinations.map((row) => {
                const name = row.vaccineCode
                  ? t(`vaccine.${row.vaccineCode}` as MessageKey)
                  : (row.productName ?? '—');
                return (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {name.startsWith('vaccine.') ? row.vaccineCode : name}
                      </p>
                      <p className="text-sm text-muted">{formatDate(row.administeredOn, locale)}</p>
                    </div>
                    {row.nextDueOn && (
                      <Badge tone="calm">
                        {t('medical.nextDueOn')}: {formatDate(row.nextDueOn, locale, today)}
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          action={
            canWrite && (
              <Button tone="quiet" onClick={() => setSheet('parasite')}>
                {t('action.add')}
              </Button>
            )
          }
        >
          {t('medical.parasites')}
        </SectionTitle>
        <Card>
          {(parasites.data?.treatments.length ?? 0) === 0 ? (
            <Empty>{t('state.empty')}</Empty>
          ) : (
            <ul>
              {parasites.data?.treatments.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {t(`parasite.${row.target}` as MessageKey)}
                    </p>
                    <p className="text-sm text-muted">
                      {formatDate(row.administeredOn, locale)}
                      {row.productName ? ` · ${row.productName}` : ''}
                    </p>
                  </div>
                  {row.nextDueOn && (
                    <Badge tone="calm">
                      {t('medical.nextDueOn')}: {formatDate(row.nextDueOn, locale, today)}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          action={
            canWrite && (
              <Button tone="quiet" onClick={() => setSheet('medication')}>
                {t('action.add')}
              </Button>
            )
          }
        >
          {t('medical.medications')}
        </SectionTitle>
        <Card>
          {(medications.data?.medications.length ?? 0) === 0 ? (
            <Empty>{t('state.empty')}</Empty>
          ) : (
            <ul className="space-y-3">
              {medications.data?.medications.map((course) => (
                <MedicationRow
                  key={course.id}
                  course={course}
                  onChanged={() => medications.reload()}
                />
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          action={
            canWrite && (
              <Button tone="quiet" onClick={() => setSheet('visit')}>
                {t('action.add')}
              </Button>
            )
          }
        >
          {t('medical.visits')}
        </SectionTitle>
        <Card>
          {(visits.data?.visits.length ?? 0) === 0 ? (
            <Empty>{t('state.empty')}</Empty>
          ) : (
            <ul>
              {visits.data?.visits.map((row) => (
                <li key={row.id} className="border-b border-line py-2 last:border-0">
                  <p className="font-medium">{row.reason}</p>
                  <p className="text-sm text-muted">{formatDate(row.visitedOn, locale)}</p>
                  {row.findings && <p className="mt-1 text-sm">{row.findings}</p>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle
          action={
            canWrite && (
              <Button tone="quiet" onClick={() => setSheet('flag')}>
                {t('action.add')}
              </Button>
            )
          }
        >
          {t('medical.flags')}
        </SectionTitle>
        <Card>
          {pet.flags.length === 0 ? (
            <Empty>{t('flag.none')}</Empty>
          ) : (
            <ul>
              {pet.flags.map((flag) => (
                <FlagRow key={flag.id} flag={flag} onChanged={onChanged} />
              ))}
            </ul>
          )}
        </Card>
      </section>

      <VaccinationSheet
        pet={pet}
        open={sheet === 'vaccination'}
        options={catalogue.data?.vaccines ?? []}
        onClose={close}
        onSaved={() => {
          close();
          reloadAll();
        }}
      />
      <ParasiteSheet
        pet={pet}
        open={sheet === 'parasite'}
        onClose={close}
        onSaved={() => {
          close();
          reloadAll();
        }}
      />
      <VisitSheet
        pet={pet}
        open={sheet === 'visit'}
        onClose={close}
        onSaved={() => {
          close();
          reloadAll();
        }}
      />
      <MedicationSheet
        pet={pet}
        open={sheet === 'medication'}
        onClose={close}
        onSaved={() => {
          close();
          reloadAll();
        }}
      />
      <FlagSheet
        pet={pet}
        open={sheet === 'flag'}
        onClose={close}
        onSaved={() => {
          close();
          onChanged();
        }}
      />
    </div>
  );
}

function FlagRow({ flag, onChanged }: { flag: HealthFlag; onChanged: () => void }): ReactNode {
  const { t, canWrite } = useSession();
  const remove = useAction(async () => {
    await api.delete(`/health-flags/${flag.id}`);
    onChanged();
  });

  return (
    <li className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0">
      <div className="min-w-0">
        <p className="truncate font-medium">{flag.label}</p>
        <p className="text-sm text-muted">
          {t(`flag.${flag.kind}` as MessageKey)} · {t(`severity.${flag.severity}` as MessageKey)}
        </p>
      </div>
      {canWrite && (
        <Button tone="quiet" className="px-3" onClick={() => void remove.run()}>
          ✕
        </Button>
      )}
    </li>
  );
}

function MedicationRow({
  course,
  onChanged,
}: {
  course: MedicationCourse;
  onChanged: () => void;
}): ReactNode {
  const { t, locale, canWrite } = useSession();
  const next = course.doses.find((dose) => dose.takenAt === null);

  const tick = useAction(async () => {
    if (!next) return;
    await api.post(`/medications/${course.id}/doses/${next.id}/taken`);
    onChanged();
  });

  return (
    <li className="border-b border-line pb-3 last:border-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{course.name}</p>
          <p className="text-sm text-muted">
            {course.dose ? `${course.dose} · ` : ''}
            {formatDate(course.startsOn, locale)}
            {course.endsOn
              ? ` — ${formatDate(course.endsOn, locale)}`
              : ` · ${t('medical.ongoing')}`}
          </p>
        </div>
        {course.progress.total > 0 && (
          <Badge tone={course.progress.missed > 0 ? 'alarm' : 'brand'}>
            {course.progress.taken}/{course.progress.total}
          </Badge>
        )}
      </div>

      {canWrite && next && (
        <Button
          tone="quiet"
          className="mt-2"
          disabled={tick.pending}
          onClick={() => void tick.run()}
        >
          {t('action.done')} · {formatDate(next.dueOn, locale)}
        </Button>
      )}
    </li>
  );
}

// -- entry sheets ---------------------------------------------------------------------------

function useCreate(path: string, onSaved: () => void) {
  return useAction(async (payload: Record<string, unknown>) => {
    await api.post(path, payload);
    onSaved();
  });
}

const today = () => new Date().toISOString().slice(0, 10);

function VaccinationSheet({
  pet,
  open,
  options,
  onClose,
  onSaved,
}: {
  pet: Pet;
  open: boolean;
  options: VaccineOption[];
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const create = useCreate(`/pets/${pet.id}/vaccinations`, onSaved);
  const [vaccineCode, setVaccineCode] = useState('');
  const [productName, setProductName] = useState('');
  const [administeredOn, setAdministeredOn] = useState(today);
  const [nextDueOn, setNextDueOn] = useState('');

  const chosen = options.find((option) => option.code === vaccineCode);

  return (
    <Sheet title={t('medical.vaccinations')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('medical.vaccine')}>
          <Select value={vaccineCode} onChange={(e) => setVaccineCode(e.target.value)}>
            <option value="">—</option>
            {options.map((option) => (
              <option key={option.code} value={option.code}>
                {t(`vaccine.${option.code}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>

        {/* The guidance behind a proposed date, so a default never reads as a prescription. */}
        {chosen && <p className="text-xs text-muted">{chosen.guidance}</p>}

        <Field label={t('medical.product')}>
          <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
        </Field>

        <Field label={t('medical.administeredOn')}>
          <Input
            type="date"
            value={administeredOn}
            onChange={(e) => setAdministeredOn(e.target.value)}
          />
        </Field>

        <Field label={t('medical.nextDueOn')} hint={t('medical.dueProposed')}>
          <Input type="date" value={nextDueOn} onChange={(e) => setNextDueOn(e.target.value)} />
        </Field>

        <Button
          full
          disabled={create.pending}
          onClick={() =>
            void create.run({
              vaccineCode: vaccineCode || undefined,
              productName: productName || undefined,
              administeredOn,
              nextDueOn: nextDueOn || undefined,
            })
          }
        >
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}

function ParasiteSheet({
  pet,
  open,
  onClose,
  onSaved,
}: {
  pet: Pet;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const create = useCreate(`/pets/${pet.id}/parasite-treatments`, onSaved);
  const [target, setTarget] = useState<'internal' | 'external' | 'both'>('internal');
  const [productName, setProductName] = useState('');
  const [administeredOn, setAdministeredOn] = useState(today);

  return (
    <Sheet title={t('medical.parasites')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('document.kind')}>
          <Select value={target} onChange={(e) => setTarget(e.target.value as typeof target)}>
            {(['internal', 'external', 'both'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`parasite.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('medical.product')}>
          <Input value={productName} onChange={(e) => setProductName(e.target.value)} />
        </Field>

        <Field label={t('medical.administeredOn')} hint={t('medical.dueProposed')}>
          <Input
            type="date"
            value={administeredOn}
            onChange={(e) => setAdministeredOn(e.target.value)}
          />
        </Field>

        <Button
          full
          disabled={create.pending}
          onClick={() =>
            void create.run({ target, productName: productName || undefined, administeredOn })
          }
        >
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}

function VisitSheet({
  pet,
  open,
  onClose,
  onSaved,
}: {
  pet: Pet;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const create = useCreate(`/pets/${pet.id}/visits`, onSaved);
  const [visitedOn, setVisitedOn] = useState(today);
  const [reason, setReason] = useState('');
  const [findings, setFindings] = useState('');
  const [treatment, setTreatment] = useState('');

  return (
    <Sheet title={t('medical.visits')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('medical.administeredOn')}>
          <Input type="date" value={visitedOn} onChange={(e) => setVisitedOn(e.target.value)} />
        </Field>
        <Field label={t('medical.reason')} error={create.error?.fieldError('reason')}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} required />
        </Field>
        <Field label={t('medical.findings')}>
          <TextArea value={findings} onChange={(e) => setFindings(e.target.value)} />
        </Field>
        <Field label={t('medical.treatment')}>
          <TextArea value={treatment} onChange={(e) => setTreatment(e.target.value)} />
        </Field>

        <Button
          full
          disabled={create.pending || reason.trim() === ''}
          onClick={() =>
            void create.run({
              visitedOn,
              reason,
              findings: findings || undefined,
              treatment: treatment || undefined,
            })
          }
        >
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}

function MedicationSheet({
  pet,
  open,
  onClose,
  onSaved,
}: {
  pet: Pet;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const create = useCreate(`/pets/${pet.id}/medications`, onSaved);
  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [timesPerDay, setTimesPerDay] = useState(2);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState('');

  return (
    <Sheet title={t('medical.medications')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('medical.doseName')} error={create.error?.fieldError('name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label={t('medical.dose')}>
          <Input value={dose} onChange={(e) => setDose(e.target.value)} />
        </Field>
        <Field label={t('medical.timesPerDay')}>
          <Input
            type="number"
            min={1}
            max={12}
            value={timesPerDay}
            onChange={(e) => setTimesPerDay(Number(e.target.value))}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('medical.startsOn')}>
            <Input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
          </Field>
          <Field label={t('medical.endsOn')} hint={t('medical.ongoing')}>
            <Input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
          </Field>
        </div>

        <Button
          full
          disabled={create.pending || name.trim() === ''}
          onClick={() =>
            void create.run({
              name,
              dose: dose || undefined,
              timesPerDay,
              startsOn,
              endsOn: endsOn || undefined,
            })
          }
        >
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}

function FlagSheet({
  pet,
  open,
  onClose,
  onSaved,
}: {
  pet: Pet;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}): ReactNode {
  const { t } = useSession();
  const create = useCreate(`/pets/${pet.id}/health-flags`, onSaved);
  const [kind, setKind] = useState<HealthFlag['kind']>('allergy');
  const [label, setLabel] = useState('');
  const [severity, setSeverity] = useState<HealthFlag['severity']>('medium');

  return (
    <Sheet title={t('flag.add')} open={open} onClose={onClose}>
      <div className="space-y-3">
        <Field label={t('document.kind')}>
          <Select value={kind} onChange={(e) => setKind(e.target.value as HealthFlag['kind'])}>
            {(['allergy', 'chronic_condition', 'drug_intolerance'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`flag.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t('document.title')} error={create.error?.fieldError('label')}>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} required />
        </Field>

        <Field label={t('severity.medium')}>
          <Select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as HealthFlag['severity'])}
          >
            {(['low', 'medium', 'high'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`severity.${value}` as MessageKey)}
              </option>
            ))}
          </Select>
        </Field>

        <Button
          full
          disabled={create.pending || label.trim() === ''}
          onClick={() => void create.run({ kind, label, severity })}
        >
          {t('action.save')}
        </Button>
      </div>
    </Sheet>
  );
}
