.PHONY: start start-backend start-frontend evaluate execute gold test-experiments typecheck-experiments thesis

MODEL ?= nova-lite
REPETITION ?= 1

start:
	npm start

start-backend:
	npm run start:backend

start-frontend:
	npm run start:frontend

test:
	npm run test:experiments

execute:
	MODEL_CONDITION=$(MODEL) REPETITION=$(REPETITION) QUESTION_ID=$(QUESTION_ID) npm --prefix src/experiments run execute

evaluate:
	MODEL_CONDITION=$(MODEL) REPETITION=$(REPETITION) npm --prefix src/experiments run evaluate

gold:
	npm --prefix src/experiments run gold

test-experiments:
	npm --prefix src/experiments test

typecheck-experiments:
	npm --prefix src/experiments run typecheck

thesis:
	PATH="/Library/TeX/texbin:$$PATH" latexmk -cd -xelatex -interaction=nonstopmode -halt-on-error docs/thesis/thesis.tex
