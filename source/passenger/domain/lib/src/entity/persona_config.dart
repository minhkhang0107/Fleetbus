class PersonaConfig {
  final String agentName;
  final String jobTitle;
  final String toneOfVoice;

  const PersonaConfig({
    required this.agentName,
    required this.jobTitle,
    required this.toneOfVoice,
  });

  PersonaConfig copyWith({
    String? agentName,
    String? jobTitle,
    String? toneOfVoice,
  }) {
    return PersonaConfig(
      agentName: agentName ?? this.agentName,
      jobTitle: jobTitle ?? this.jobTitle,
      toneOfVoice: toneOfVoice ?? this.toneOfVoice,
    );
  }
}
