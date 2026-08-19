<?php

namespace App\Services;

use RuntimeException;

class SystemPromptBuilder
{
    public function __construct(
        private PersonaLoader $personaLoader,
        private SkillLoader $skillLoader,
    ) {}

    public function build(string $personaName, string $skillName): string
    {
        $persona = $this->personaLoader->load($personaName);

        if (! in_array($skillName, $persona['skills'], true)) {
            throw new RuntimeException("Persona [{$personaName}] does not allow skill [{$skillName}].");
        }

        $skill = $this->skillLoader->load($skillName);

        return implode("\n\n", [
            $persona['instructions'],
            "# Active skill: {$skill['name']}",
            $skill['instructions'],
        ]);
    }
}
