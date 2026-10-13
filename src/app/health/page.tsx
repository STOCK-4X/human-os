"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { BodyTab } from "@/components/health/BodyTab";
import { RecoveryTab } from "@/components/health/RecoveryTab";
import { SleepTab } from "@/components/health/SleepTab";
import { TrendsTab } from "@/components/health/TrendsTab";
import { Loading, Page, Segmented } from "@/components/ui";
import { useDataSet, useToday } from "@/hooks/data";

type Tab = "sleep" | "recovery" | "body" | "trends";
const TABS: Tab[] = ["sleep", "recovery", "body", "trends"];

function Health() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (TABS.includes(params.get("tab") as Tab) ? params.get("tab") : "sleep") as Tab;
  const data = useDataSet();
  const today = useToday(data?.profile.timeZone);

  return (
    <Page title="Health">
      <Segmented
        label="Health sections"
        value={tab}
        onChange={(t) => router.replace(`/health?tab=${t}`, { scroll: false })}
        options={[
          { value: "sleep", label: "Sleep" },
          { value: "recovery", label: "Recovery" },
          { value: "body", label: "Body" },
          { value: "trends", label: "Trends" },
        ]}
      />
      {!data || !today ? (
        <Loading />
      ) : tab === "sleep" ? (
        <SleepTab data={data} today={today} />
      ) : tab === "recovery" ? (
        <RecoveryTab data={data} today={today} />
      ) : tab === "body" ? (
        <BodyTab profile={data.profile} today={today} />
      ) : (
        <TrendsTab data={data} today={today} />
      )}
    </Page>
  );
}

export default function HealthPage() {
  return (
    <Suspense fallback={<Page title="Health"><Loading /></Page>}>
      <Health />
    </Suspense>
  );
}
