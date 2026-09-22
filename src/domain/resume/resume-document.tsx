import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

import type { PublishedResumeData } from "./resume-data";

const styles = StyleSheet.create({
  page: { padding: 42, fontFamily: "Helvetica", color: "#172033", fontSize: 10, lineHeight: 1.45 },
  title: { fontSize: 26, fontWeight: 700, marginBottom: 4 },
  headline: { fontSize: 13, color: "#42506a", marginBottom: 8 },
  location: { fontSize: 9, color: "#657089", marginBottom: 18 },
  intro: { fontSize: 11, marginBottom: 18 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "#3458d1", marginBottom: 7, textTransform: "uppercase" },
  item: { marginBottom: 10 },
  itemTitle: { fontSize: 11, fontWeight: 700 },
  itemMeta: { fontSize: 9, color: "#657089", marginBottom: 3 },
  link: { color: "#3458d1", textDecoration: "none" },
  skills: { display: "flex", flexDirection: "row", flexWrap: "wrap", gap: 4 },
  skill: { backgroundColor: "#eef2ff", padding: 4, borderRadius: 2 },
});

function year(value: string) {
  return new Date(value).getUTCFullYear().toString();
}

export function ResumeDocument({ data }: { data: PublishedResumeData }) {
  return (
    <Document title={data.settings.title} author={data.profile.name} subject="Published resume">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>{data.profile.name}</Text>
        <Text style={styles.headline}>{data.profile.headline}</Text>
        <Text style={styles.location}>{data.profile.location}</Text>
        <Text style={styles.intro}>{data.settings.intro}</Text>
        <Text>{data.profile.summary}</Text>

        {data.experience.length > 0 && <View style={styles.section} break={false}>
          <Text style={styles.sectionTitle}>Experience</Text>
          {data.experience.map((item) => <View key={`${item.company}-${item.role}`} style={styles.item} wrap>
            <Text style={styles.itemTitle}>{item.role} · {item.company}</Text>
            <Text style={styles.itemMeta}>{year(item.startDate)} – {item.endDate ? year(item.endDate) : "Present"}</Text>
            <Text>{item.description}</Text>
          </View>)}
        </View>}

        {data.projects.length > 0 && <View style={styles.section} break={false}>
          <Text style={styles.sectionTitle}>Projects</Text>
          {data.projects.map((item) => <View key={item.name} style={styles.item} wrap>
            <Text style={styles.itemTitle}>{item.name}</Text>
            <Text>{item.description}</Text>
            <Text>{item.technologies.join(" · ")}</Text>
            {item.url && <Link src={item.url} style={styles.link}>{item.url}</Link>}
            {item.repositoryUrl && <Link src={item.repositoryUrl} style={styles.link}>{item.repositoryUrl}</Link>}
          </View>)}
        </View>}

        {data.skills.length > 0 && <View style={styles.section} break={false}>
          <Text style={styles.sectionTitle}>Skills</Text>
          <View style={styles.skills}>{data.skills.map((skill) => <Text key={`${skill.category}-${skill.name}`} style={styles.skill}>{skill.name} · {skill.category}</Text>)}</View>
        </View>}
      </Page>
    </Document>
  );
}
