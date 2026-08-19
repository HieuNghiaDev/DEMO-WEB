<?php

namespace App\Services;

class PersonaLoader extends MarkdownDefinitionLoader
{
    /** @return array{name: string, display_name: string, skills: list<string>, instructions: string} */
    public function load(string $name): array
    {
        $definition = $this->readDefinition('secretary/personas', $name, 'Persona');
        $frontmatter = $definition['frontmatter'];

        return [
            'name' => $this->requiredString($frontmatter, 'name', $name, 'Persona'),
            'display_name' => $this->requiredString($frontmatter, 'display_name', $name, 'Persona'),
            'skills' => $this->requiredStringList($frontmatter, 'skills', $name, 'Persona'),
            'instructions' => $definition['instructions'],
        ];
    }
}
