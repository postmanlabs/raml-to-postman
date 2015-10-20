A RAML to POSTMan converter.

Usage examples:
    Read spec.raml and store the output in output.json after grouping the requests into folders
        ./raml2postman -s spec.raml -o output.json -g

    Read spec.raml and print the output to the console
        ./raml2postman -s spec.raml

    Read spec.raml and print the prettified output to the console
        ./raml2postman -s spec.raml -p

In case you want to debug the converter with a RAML folder:

```$ sudo apt-get install php5-cli```

And use this script:

    <?php
    function doInclude ($file, $tabIndex = '') {
        $contents = @file_get_contents($file);
        if (!$contents) {
            $contents = @file_get_contents(BASE_PATH . $file);
        }

        if (!$contents) {
            return "\n\n# Unable to Include" . $file . "\n\n";
        }

        if ($tabIndex) {
            $contents = $tabIndex . str_replace("\n", "\n" . $tabIndex, $contents);
        }

        $contents = preg_replace_callback('/(([\s\t]*)([a-z0-9_\/\-]+)):[\s]+\!include ([^\s]+)/i',
            function($matches) {
                $property = $matches[3];
                $spacing = $matches[2];
                $file = $matches[4];

                if (!preg_match("/^((https?:\/\/)|\/)/i", $file)) {
                    $file = BASE_PATH . "/" . $file;
                }

                $i = 0;
                $cap = ": | \n";
                $subContent = doInclude($file, $spacing . "    ");
                $subLines = explode("\n", $subContent);

                while (isset($subLines[$i]) && !preg_match("/[^\s]/i", $subLines[$i])) {
                    $i++;
                }

                if (strpos($subLines[$i], ':') && preg_match("/(:\s*('|\")(.+)('|\"))*/", $subLines[$i])) {
                    $cap = ":\n";
                }

                return $spacing . $property . $cap . $subContent;

            },
            $contents);

        return $contents;
    }


    $file = $argv[1];
    define('BASE_PATH', dirname($file));

    echo doInclude($file);
    ?>

Run it like this:

```php script.php /path/to/api/root.raml > combined.raml```

Script credits: https://github.com/mikestowe/php-ramlMerge
