/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Recording_StoppedInputs */

const uk_recording_stopped = /** @type {(inputs: Recording_StoppedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Запис зупинено: ${i?.name}`)
};

const en_recording_stopped = /** @type {(inputs: Recording_StoppedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Recording stopped: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Recording stopped: {name}" |
*
* @param {Recording_StoppedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const recording_stopped = /** @type {((inputs: Recording_StoppedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Recording_StoppedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_recording_stopped(inputs)
	return en_recording_stopped(inputs)
});