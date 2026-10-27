# Build one app image: docker build --build-arg MODULE=connectors|replay|pipeline .
FROM maven:3.9-eclipse-temurin-21 AS build
ARG MODULE
WORKDIR /src
# poms first so the dependency layer is cached until a pom changes
COPY pom.xml .
COPY common/pom.xml common/
COPY connectors/pom.xml connectors/
COPY replay/pom.xml replay/
COPY pipeline/pom.xml pipeline/
RUN mvn -B -q dependency:go-offline || true
COPY common common
COPY connectors connectors
COPY replay replay
COPY pipeline pipeline
RUN mvn -B -q -pl ${MODULE} -am package -DskipTests

FROM eclipse-temurin:21-jre
ARG MODULE
ARG PORT=8080
RUN useradd --system --uid 10001 --no-create-home app
WORKDIR /app
COPY --from=build /src/${MODULE}/target/*.jar app.jar
USER app
EXPOSE ${PORT}
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
