<?php

namespace App\Services;

class SkillLoader extends MarkdownDefinitionLoader
{
    /** @return array{name: string, trigger: string, tools: list<string>, instructions: string, schedule?: string} */
    public function load(string $name): array
    {
        $definition = $this->readDefinition('secretary/skills', $name, 'Skill');
        $frontmatter = $definition['frontmatter'];

        $skill = [
            'name' => $this->requiredString($frontmatter, 'name', $name, 'Skill'),
            'trigger' => $this->requiredString($frontmatter, 'trigger', $name, 'Skill'),
            'tools' => $this->requiredStringList($frontmatter, 'tools', $name, 'Skill'),
            'instructions' => $definition['instructions'],
        ];

        if (isset($frontmatter['schedule'])) {
            $skill['schedule'] = $this->requiredString($frontmatter, 'schedule', $name, 'Skill');
        }

        return $skill;
    }
}
