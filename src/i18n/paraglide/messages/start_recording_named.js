/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Start_Recording_NamedInputs */

const uk_start_recording_named = /** @type {(inputs: Start_Recording_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Почати запис: ${i?.name}`)
};

const en_start_recording_named = /** @type {(inputs: Start_Recording_NamedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Start recording: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Start recording: {name}" |
*
* @param {Start_Recording_NamedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const start_recording_named = /** @type {((inputs: Start_Recording_NamedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Start_Recording_NamedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_start_recording_named(inputs)
	return en_start_recording_named(inputs)
});