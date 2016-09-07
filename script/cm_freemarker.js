
// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE
//

//based on Magnus Ljung's freemarker parser for CodeMirror I

//variable-2 is actually for ${variable}, builtin for ?floor

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
	
	CodeMirror.defineMode("freemarker", function(config) {
        var autoSelfClosers = {"else": true, "elseif": true};
        var tokens, token;
        var cc = [base];
        var tokenNr = 0, indented = 0;
        var currentTag = null, context = null;
        var consume;
        var harmlessTokens = { "text": true, "comment": true };

        function tokenizeFreemarker (stream, state) {
            function tokenizer(stream, state) {
                // Newlines are always a separate token.
                function isWhiteSpace(ch) {
                    return ch != "\n" && /^[\s\u00a0]*$/.test(ch);
                }

                var tokenizer = {
                    state: state,

                    take: function(type) {
                        if (typeof(type) == "string")
                            type = {style: type, type: type};

                        type.content = (type.content || "") + stream.current();
                        if (!/\n$/.test(type.content))
                            stream.eatWhile(isWhiteSpace, true);
                        type.value = type.content + stream.current();
                        return type;
                    },

                    next: function () {
                      if (stream.eol()){
                          stream.next();
                          return true;
                      }

                      var type;
                      if (stream.peek() == "\n") {
                        stream.next();
                        return this.take("whitespace");
                      }

                      if ( stream.peek() !== null && isWhiteSpace(stream.peek()) )
                        type = "whitespace";
                      else
                        while (!type)
                          type = this.state(stream, function(s) {tokenizer.state = s;});

                      return this.take(type);
                    }
                };

                return tokenizer;
            }

            function inText(stream, setState) {

                var ch = stream.next();
                if (ch == "<") {
                    if (stream.peek() && stream.peek() == "!") {
                        stream.next();
                        if (stream.match("--", true, false)) {
                            setState(inBlock("comment", "-->"));
                            return null;
                        } else {
                            return "text";
                        }
                    } else {
                        stream.eatWhile(/[\#\@\/]/, true);
                        setState(inFreemarker(">"));
                        return "boundary";
                    }
                }
                else if (ch == "[") {
                    if(stream.peek() && stream.peek().match(/[\#\@]/) !== null) {
                        setState(pendingFreemarker(stream.peek(), "]", false));
                        return "boundary";
                    } else if(stream.peek() && stream.peek().match(/\//) !== null) {
                        setState(pendingFreemarkerEnd("]"));
                        return "boundary";
                    } else {
                        return "text";
                    }
                }
                else if (ch == "$") {
                    if(stream.peek() && stream.peek().match(/[\{\w]/) !== null) {
                        setState(pendingFreemarker("{", "}", true));
                        return "variable-2";
                    } else {
                        return "text";
                    }
                }
                else {
                    stream.match(/[^\$<\n]/, true);
                    return "text";
                }
            }

            function pendingFreemarker(startChar, endChar, nextCanBeIdentifier) {
                return function(stream, setState) {
                    var ch = stream.next();
                    if(ch == startChar) {
                        setState(inFreemarker(endChar));
                        return "variable-2";
                    } else if(nextCanBeIdentifier) {
                        stream.match(/\w/, true);
                        setState(inText);
                        return "variable-2";
                    } else {
                        setState(inText);
                        return null;
                    }
                }
            }

            function pendingFreemarkerEnd(endChar) {
                return function(stream, setState) {
                    var ch = stream.next();
                    if(ch == "/") {
                        setState(pendingFreemarker(stream.peek(), endChar, false));
                        return "boundary";
                    } else {
                        setState(inText);
                        return null;
                    }
                }
            }

            function inFreemarker(terminator) {
                return function(stream, setState) {

                    var ch = stream.next();
                    if (ch == terminator) {
                        setState(inText);
                        if (terminator == "}")
                            return "variable-2";
                        return "boundary";
                    } else if (/[?\/]/.test(ch) && stream.peek() == terminator) {
                        stream.next();
                        setState(inText);
                        return "boundary";
                    } else if(/[?!]/.test(ch)) {
                        if(ch == "?") {
                            if(stream.peek() == "?") {
                                stream.next();
                            } else {
                                setState(inBuiltIn(inFreemarker(terminator)));
                            }
                        }
                        return "builtin";
                    } else if(/\(/.test(ch)) {
                        setState(inExpression(")", terminator));
                        return "punctuation";
                    }
                    else if(/[+\/\-*%=]/.test(ch)) {
                        return "punctuation";
                    } else if (/[0-9]/.test(ch)) {
                        stream.eatWhile(/[0-9\.]/, true);
                        return "number";
                    } else if (/\w/.test(ch)) {
                        stream.match(/\w/, true);
                        if (terminator == "}")
                            return "variable-2";
                        return "identifier"
                    } else if(/[\'\"]/.test(ch)) {
                        setState(inString(ch, inFreemarker(terminator)));
                        return "string";
                    } else {
                        stream.match(/[^\s\u00a0<>\"\'\}?!\/]/, true);
                        return "generic";
                    }
                };
            }

            function inExpression(terminator, outerTerminator) {
                return function(stream, setState) {
                    var ch = stream.next();

                    if (ch == terminator) {
                        setState(inFreemarker(outerTerminator));
                        return "punctuation";
                    } else if (/[?\/]/.test(ch) && stream.peek() == terminator) {
                        stream.next();
                        setState(inText);
                        return "boundary";
                    } else if(/[?!]/.test(ch)) {
                        if(ch == "?") {
                            if(stream.peek() == "?") {
                                stream.next();
                            } else {
                                setState(inBuiltIn(inExpression(")", outerTerminator)));
                            }
                        }
                        return "builtin";
                    } else if(/\(/.test(ch)) {
                        setState(inExpression(")", outerTerminator));
                        return "punctuation";
                    }
                    else if(/[+\/\-*%=]/.test(ch)) {
                        return "punctuation";
                    } else if (/[0-9]/.test(ch)) {
                        stream.eatWhile(/[0-9\.]/, true);
                        return "number";
                    } else if (/\w/.test(ch)) {
                        stream.match(/\w/, true);
                        if (terminator == "}")
                            return "variable-2";
                        return "identifier"
                    } else if(/[\'\"]/.test(ch)) {
                        setState(inString(ch, inExpression(")", outerTerminator)));
                        return "string";
                    } else {
                        stream.match(/[^\s\u00a0<>\"\'\}?!\/]/, true);
                        return "generic";
                    }
                }
            }

            function inBuiltIn(nextState) {
                return function(stream, setState) {
                    var ch = stream.peek();
                    if(/[a-zA-Z_]/.test(ch)) {
                        stream.next();
                        stream.match(/[a-zA-Z_0-9\.]+/, true);
                        setState(nextState);
                        return "builtin";
                    } else {
                        setState(nextState);
                    }
                };
            }

            function inString(quote, nextState) {
                return function(stream, setState) {
                    while (!stream.eol()) {
                        if (stream.next() == quote) {
                            setState(nextState);
                            break;
                        }
                    }
                    return "string";
                };
            }

            function inBlock(style, terminator) {
                return function(stream, setState) {
                    while (!stream.eol()) {
                        if (stream.match(terminator, true)) {
                            setState(inText);
                            break;
                        }
                        stream.next();
                    }
                    return style;
                };
            }

            return  tokenizer(stream, state || inText);
        };

        function push(fs) {
            for (var i = fs.length - 1; i >= 0; i--)
                cc.push(fs[i]);
        }
        function cont() {
            push(arguments);
            consume = true;
        }
        function pass() {
            push(arguments);
            consume = false;
        }

        function markErr() {
            token.style += " freemarker-error";
        }

        function expect(text) {
            return function(style, content) {
                if (content == text) cont();
                else {markErr(); cont(arguments.callee);}
            };
        }

        function pushContext(tagname, startOfLine) {
            context = {prev: context, name: tagname, indent: indented, startOfLine: startOfLine};
        }

        function popContext() {
            context = context.prev;
        }

        function computeIndentation(baseContext) {
            return function(nextChars, current, direction, firstToken) {
                var context = baseContext;

                nextChars = getThreeTokens(firstToken);

                if ((context && /^<\/\#/.test(nextChars)) ||
                    (context && /^\[\/\#/.test(nextChars))) {
                    context = context.prev;
                }

                while (context && !context.startOfLine) {
                    context = context.prev;
                }

                if (context) {
                    if(/^<\#else/.test(nextChars) ||
                       /^\[\#else/.test(nextChars)) {
                        return context.indent;
                    }
                    return context.indent + indentUnit;
                } else {
                    return 0;
                }
            };
        }

        function getThreeTokens(firstToken) {
            var secondToken = firstToken ? firstToken.nextSibling : null;
            var thirdToken = secondToken ? secondToken.nextSibling : null;

            var nextChars = (firstToken && firstToken.currentText) ? firstToken.currentText : "";
            if(secondToken && secondToken.currentText) {
                nextChars = nextChars + secondToken.currentText;
                if(thirdToken && thirdToken.currentText) {
                    nextChars = nextChars + thirdToken.currentText;
                }
            }

            return nextChars;
        }

        function base() {
            return pass(element, base);
        }

        function element(style, content) {
            if (content == "<#") {
                cont(tagname, notEndTag, endtag("/>", ">", tokenNr == 1));
            } else if (content == "</#") {
                cont(closetagname, expect(">"));
            } else if(content == "[" && style == "boundary") {
                cont(hashOrCloseHash);
            } else {
                cont();
            }
        }

        function hashOrCloseHash(style, content) {
            if(content == "#") {
                cont(tagname, notHashEndTag, endtag("/]", "]", tokenNr == 2));
            } else if(content == "/") {
                cont(closeHash);
            } else {
                markErr();
            }
        }

        function closeHash(style, content) {
            if(content == "#") {
                cont(closetagname, expect("]"));
            } else {
                markErr();
            }
        }


        function tagname(style, content) {
            if (style == "identifier") {
                currentTag = content.toLowerCase();
                token.style = "directive";
                cont();
            } else {
                currentTag = null;
                pass();
            }
        }

        function closetagname(style, content) {
            if (style == "identifier") {
                token.style = "directive";
                if (context && content.toLowerCase() == context.name) {
                    popContext();
                } else {
                    markErr();
                }
            }
            cont();
        }

        function notEndTag(style, content) {
            if (content == "/>" || content == ">") {
                pass();
            } else {
                cont(notEndTag);
            }
        }

        function notHashEndTag(style, content) {
            if (content == "/]" || content == "]") {
                pass();
            } else {
                cont(notHashEndTag);
            }
        }

        function endtag(closeTagPattern, endTagPattern, startOfLine) {
            return function(style, content) {
                if (content == closeTagPattern || (content == endTagPattern && autoSelfClosers.hasOwnProperty(currentTag))) {
                    cont();
                } else if (content == endTagPattern) {
                    pushContext(currentTag, startOfLine);
                    cont();
                } else {
                    markErr();
                    cont(arguments.callee);
                }
            };
        }


        return {
            indent: function() { return indented; },

            token: function(stream, state) {
                if (!tokens) {
                    tokens = tokenizeFreemarker(stream);
                }
                token = tokens.next();

                if (stream.eol())
                    tokens = null;
                if (token === null) return null;
                if (token.style == "whitespace" && tokenNr == 0)
                    indented = token.value.length;
                else
                    tokenNr++;
                if (token.content == "\n") {
                    indented = tokenNr = 0;
                    token.indentation = computeIndentation(context);
                }

                if (token.style == "whitespace" || token.type == "comment")
                    return token.type;
                var recursiveHelper;
                while(true) {
                    consume = false;
                    recursiveHelper = cc.pop();
                    recursiveHelper(token.style, token.content);
                    if (consume) {
                        return token.type;
                    }
                }
            },

            copyState: function(){
                var _cc = cc.concat([]), _tokenState = tokens.state, _context = context;
                var parser = this;

                return function(input){
                    cc = _cc.concat([]);
                    tokenNr = indented = 0;
                    context = _context;
                    // tokens = tokenizeFreemarker(input, _tokenState);
                    return parser;
                };
            },
            electricChars: '>'
        };

    });
});
